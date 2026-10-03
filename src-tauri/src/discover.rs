//! Turning whatever someone typed into a feed.
//!
//! People paste a site's address far more often than its feed's, and they
//! leave off the scheme. Both used to fail, with "no root element" and
//! "builder error" respectively, which nobody can act on. This module accepts
//! the address as typed, follows a page to the feed it advertises, tries the
//! usual paths when it advertises nothing, and words every failure as
//! something a person can do something about.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use url::Url;

use crate::feed::{self, FetchOutcome};

static LINK_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<link\b[^>]*>").unwrap());
static ATTR: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?is)([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).unwrap());

/// Paths worth trying when a page advertises no feed at all. Short on purpose:
/// every guess is a request to someone else's server.
const COMMON_PATHS: &[&str] = &[
    "/feed",
    "/rss.xml",
    "/feed.xml",
    "/atom.xml",
    "/index.xml",
    "/rss",
];

const ACCEPT: &str = "application/rss+xml, application/atom+xml, application/feed+json, \
                      application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5";

/// A feed that was found, and the address it was found at.
pub struct Resolved {
    pub url: String,
    pub outcome: FetchOutcome,
    /// True when the address typed was a page and the feed came from it.
    pub discovered: bool,
}

/// What the Add Feed dialog shows before anything is saved.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub url: String,
    pub title: String,
    pub site_url: Option<String>,
    pub item_count: usize,
    pub latest: Vec<PreviewItem>,
    pub discovered: bool,
    pub existing: Option<Existing>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewItem {
    pub title: String,
    pub published: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Existing {
    pub id: i64,
    pub name: String,
}

/// The addresses to try for what was typed, best guess first.
pub fn candidates(input: &str) -> Result<Vec<String>, String> {
    let input = input.trim();
    if input.is_empty() {
        return Err("Enter a feed or a website address.".into());
    }
    if input.contains(char::is_whitespace) {
        return Err("A web address cannot contain spaces.".into());
    }
    let with_scheme = |s: &str| {
        Url::parse(s)
            .ok()
            .filter(|u| matches!(u.scheme(), "http" | "https"))
    };

    if input.contains("://") {
        return match with_scheme(input) {
            Some(u) => Ok(vec![u.to_string()]),
            None => Err("Only http and https addresses can be followed.".into()),
        };
    }
    // No scheme: https first, and plain http only if that cannot connect.
    let https = with_scheme(&format!("https://{input}"))
        .ok_or_else(|| "That does not look like a web address.".to_string())?;
    let http = with_scheme(&format!("http://{input}"))
        .ok_or_else(|| "That does not look like a web address.".to_string())?;
    Ok(vec![https.to_string(), http.to_string()])
}

/// Find the feed behind whatever was typed.
pub async fn resolve(client: &reqwest::Client, input: &str) -> Result<Resolved, String> {
    let tries = candidates(input)?;
    let mut last_err = String::new();

    for (i, url) in tries.iter().enumerate() {
        match get(client, url).await {
            // Could not connect at all: worth trying the next scheme.
            Err(Failure::Network(msg)) if i + 1 < tries.len() => {
                last_err = msg;
                continue;
            }
            Err(f) => return Err(f.message()),
            Ok(page) => return from_page(client, url, page).await,
        }
    }
    Err(last_err)
}

async fn from_page(client: &reqwest::Client, url: &str, page: Page) -> Result<Resolved, String> {
    if let Ok(outcome) = feed::parse(
        &page.body,
        url,
        page.etag.clone(),
        page.last_modified.clone(),
    ) {
        return Ok(Resolved {
            url: url.to_string(),
            outcome,
            discovered: false,
        });
    }

    if !page.looks_like_html() {
        return Err("That address answered, but not with a feed.".into());
    }

    let base = Url::parse(url).map_err(|_| "That does not look like a web address.".to_string())?;
    let text = String::from_utf8_lossy(&page.body);

    // What the page advertises, then the usual places, never the same twice.
    let mut tried: Vec<String> = vec![url.to_string()];
    let mut guesses = advertised(&text, &base);
    guesses.extend(
        COMMON_PATHS
            .iter()
            .filter_map(|p| base.join(p).ok().map(|u| u.to_string())),
    );

    for guess in guesses {
        if tried.contains(&guess) {
            continue;
        }
        tried.push(guess.clone());
        if let Ok(page) = get(client, &guess).await {
            if let Ok(outcome) = feed::parse(&page.body, &guess, page.etag, page.last_modified) {
                return Ok(Resolved {
                    url: guess,
                    outcome,
                    discovered: true,
                });
            }
        }
    }
    Err("That page is not a feed, and it does not link to one.".into())
}

/// Feed links declared in a page's head, RSS and Atom ahead of JSON.
pub fn advertised(html: &str, base: &Url) -> Vec<String> {
    let mut found: Vec<(u8, String)> = Vec::new();
    for tag in LINK_TAG.find_iter(html) {
        let mut rel = String::new();
        let mut kind = String::new();
        let mut href = String::new();
        for cap in ATTR.captures_iter(tag.as_str()) {
            let name = cap[1].to_ascii_lowercase();
            let value = cap
                .get(2)
                .or_else(|| cap.get(3))
                .or_else(|| cap.get(4))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            match name.as_str() {
                "rel" => rel = value.to_ascii_lowercase(),
                "type" => kind = value.to_ascii_lowercase(),
                "href" => href = value,
                _ => {}
            }
        }
        if !rel.split_whitespace().any(|r| r == "alternate") || href.is_empty() {
            continue;
        }
        let rank = match kind.as_str() {
            "application/rss+xml" | "application/atom+xml" => 0,
            "application/feed+json" | "application/json" => 1,
            _ => continue,
        };
        if let Ok(u) = base.join(&href) {
            found.push((rank, u.to_string()));
        }
    }
    found.sort_by_key(|(rank, _)| *rank);
    found.into_iter().map(|(_, u)| u).collect()
}

/* ---------------------------------- fetch ---------------------------------- */

struct Page {
    body: Vec<u8>,
    content_type: String,
    etag: Option<String>,
    last_modified: Option<String>,
}

impl Page {
    fn looks_like_html(&self) -> bool {
        if self.content_type.contains("html") {
            return true;
        }
        let head =
            String::from_utf8_lossy(&self.body[..self.body.len().min(512)]).to_ascii_lowercase();
        head.contains("<!doctype html") || head.contains("<html")
    }
}

enum Failure {
    Network(String),
    Status(u16, String),
}

impl Failure {
    fn message(self) -> String {
        match self {
            Failure::Network(m) => m,
            Failure::Status(404, host) => format!("{host} has nothing at that address (404)."),
            Failure::Status(401 | 403, host) => format!("{host} refused the request."),
            Failure::Status(code, host) if code >= 500 => {
                format!("{host} had a problem answering ({code}). Try again later.")
            }
            Failure::Status(code, host) => format!("{host} answered with an error ({code})."),
        }
    }
}

async fn get(client: &reqwest::Client, url: &str) -> Result<Page, Failure> {
    let host = Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_else(|| url.to_string());

    let res = client
        .get(url)
        .header("Accept", ACCEPT)
        .send()
        .await
        .map_err(|e| {
            Failure::Network(if e.is_timeout() {
                format!("{host} took too long to answer.")
            } else {
                format!("Could not reach {host}.")
            })
        })?;

    let status = res.status();
    if !status.is_success() {
        return Err(Failure::Status(status.as_u16(), host));
    }
    let header = |name: &str| {
        res.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let content_type = header("content-type")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let etag = header("etag");
    let last_modified = header("last-modified");
    let body = res
        .bytes()
        .await
        .map_err(|_| Failure::Network(format!("{host} stopped answering part way through.")))?
        .to_vec();
    Ok(Page {
        body,
        content_type,
        etag,
        last_modified,
    })
}

/// The preview the dialog shows, from a resolved feed.
pub fn preview(resolved: &Resolved, existing: Option<Existing>) -> Preview {
    let mut entries: Vec<&feed::ParsedEntry> = resolved.outcome.entries.iter().collect();
    entries.sort_by_key(|e| std::cmp::Reverse(e.published));
    Preview {
        url: resolved.url.clone(),
        title: resolved
            .outcome
            .feed_title
            .clone()
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| resolved.url.clone()),
        site_url: resolved.outcome.site_url.clone(),
        item_count: resolved.outcome.entries.len(),
        latest: entries
            .iter()
            .take(3)
            .map(|e| PreviewItem {
                title: e.title.clone(),
                published: e.published,
            })
            .collect(),
        discovered: resolved.discovered,
        existing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_address_is_taken_as_is() {
        assert_eq!(
            candidates("https://example.com/feed").unwrap(),
            vec!["https://example.com/feed"]
        );
    }

    #[test]
    fn a_bare_address_tries_https_then_http() {
        assert_eq!(
            candidates("  example.com/feed  ").unwrap(),
            vec!["https://example.com/feed", "http://example.com/feed"]
        );
    }

    #[test]
    fn nonsense_is_refused_with_a_reason() {
        assert!(candidates("").is_err());
        assert!(candidates("two words").is_err());
        assert!(candidates("ftp://example.com/x").is_err());
    }

    #[test]
    fn advertised_feeds_are_found_and_absolutised() {
        let base = Url::parse("https://site.test/blog/").unwrap();
        let html = r#"<head>
            <link rel="stylesheet" href="/s.css">
            <link rel="alternate" type="application/feed+json" href="/feed.json">
            <link href='rss.xml' type='application/rss+xml' rel='alternate'>
            <link rel="alternate" hreflang="fr" href="/fr/">
        </head>"#;
        assert_eq!(
            advertised(html, &base),
            vec![
                "https://site.test/blog/rss.xml",
                "https://site.test/feed.json"
            ]
        );
    }

    #[test]
    fn a_page_with_no_feed_links_advertises_nothing() {
        let base = Url::parse("https://site.test/").unwrap();
        assert!(advertised("<html><head><title>x</title></head></html>", &base).is_empty());
    }
}
