//! Fetch → parse → sanitise. All of it in Rust, off the UI thread.
//!
//! This is the whole reason the app is built this way. Fluent Reader parsed raw
//! feed HTML inside the renderer; an article containing `<geolocation>` made
//! Blink instantiate that element and the renderer process was terminated
//! outright — a blank window that came back blank on every launch, because the
//! article was already stored. Here the webview never sees feed HTML that has
//! not been through `ammonia` first, with an allowlist that cannot emit an
//! unknown element at all.

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

/// Feeds behind FeedBurner (and a few CDNs) reject requests that look like a
/// bot — Fluent Reader issue #629, and the reason two feeds silently failed to
/// import on this machine. A real browser UA fixes both.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

static IMG_SRC: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)<img[^>]+src\s*=\s*["']([^"']+)["']"#).unwrap());
static TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)<[^>]*>").unwrap());
static WS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

#[derive(Debug, Clone)]
pub struct FetchOutcome {
    pub entries: Vec<ParsedEntry>,
    pub feed_title: Option<String>,
    pub site_url: Option<String>,
    pub icon_url: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    /// server answered 304 — nothing changed, nothing to write
    pub not_modified: bool,
}

#[derive(Debug, Clone)]
pub struct ParsedEntry {
    pub guid: String,
    pub title: String,
    pub link: Option<String>,
    pub author: Option<String>,
    pub published: i64,
    pub content: String,
    pub snippet: String,
    pub thumbnail: Option<String>,
    pub dedupe_hash: String,
}

pub fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?)
}

/// Fetch one feed. `etag`/`last_modified` make the poll conditional, so an
/// unchanged feed costs a 304 and no parsing at all.
pub async fn fetch(
    client: &reqwest::Client,
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> Result<FetchOutcome> {
    let mut req = client.get(url).header("Accept", "application/rss+xml, application/atom+xml, application/xml, application/feed+json, text/xml;q=0.9, */*;q=0.8");
    if let Some(tag) = etag {
        req = req.header("If-None-Match", tag);
    }
    if let Some(lm) = last_modified {
        req = req.header("If-Modified-Since", lm);
    }

    let res = req.send().await?;
    let status = res.status();

    if status == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(FetchOutcome {
            entries: vec![],
            feed_title: None,
            site_url: None,
            icon_url: None,
            etag: etag.map(str::to_owned),
            last_modified: last_modified.map(str::to_owned),
            not_modified: true,
        });
    }
    if !status.is_success() {
        return Err(anyhow!("HTTP {}", status.as_u16()));
    }

    let header = |name: &str| {
        res.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let new_etag = header("etag");
    let new_lm = header("last-modified");

    let bytes = res.bytes().await?;
    parse(&bytes, url, new_etag, new_lm)
}

pub fn parse(
    bytes: &[u8],
    source_url: &str,
    etag: Option<String>,
    last_modified: Option<String>,
) -> Result<FetchOutcome> {
    let base = url::Url::parse(source_url).ok();
    let feed = feed_rs::parser::parse(bytes).map_err(|e| anyhow!("parse: {e}"))?;

    let feed_title = feed.title.as_ref().map(|t| t.content.trim().to_owned());
    let site_url = feed
        .links
        .iter()
        .find(|l| l.rel.as_deref() != Some("self"))
        .map(|l| l.href.clone())
        .or_else(|| feed.links.first().map(|l| l.href.clone()));
    let icon_url = feed
        .icon
        .as_ref()
        .map(|i| i.uri.clone())
        .or_else(|| feed.logo.as_ref().map(|i| i.uri.clone()));

    let mut entries = Vec::with_capacity(feed.entries.len());
    let mut seen: HashSet<String> = HashSet::new();

    for e in feed.entries {
        let link = e
            .links
            .iter()
            .find(|l| l.rel.as_deref().map_or(true, |r| r == "alternate"))
            .or_else(|| e.links.first())
            .map(|l| absolutise(&l.href, base.as_ref()));

        let title = e
            .title
            .as_ref()
            .map(|t| decode_entities(t.content.trim()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Untitled".to_owned());

        // Prefer full content; fall back to the summary.
        let raw = e
            .content
            .as_ref()
            .and_then(|c| c.body.clone())
            .or_else(|| e.summary.as_ref().map(|s| s.content.clone()))
            .unwrap_or_default();

        let content = sanitise(&raw, base.as_ref());
        let snippet = snippet_of(&content);

        // media:thumbnail first, then the first inline <img>
        let thumbnail = e
            .media
            .iter()
            .flat_map(|m| m.thumbnails.iter().map(|t| t.image.uri.clone()))
            .next()
            .or_else(|| first_image(&content))
            .map(|u| absolutise(&u, base.as_ref()));

        // A feed that gives no guid still needs a stable identity across polls.
        let guid = if e.id.trim().is_empty() {
            hash(&[link.as_deref().unwrap_or(""), &title])
        } else {
            e.id.clone()
        };
        if !seen.insert(guid.clone()) {
            continue; // same guid twice in one document
        }

        let published = e
            .published
            .or(e.updated)
            .map(|d| d.timestamp())
            .unwrap_or_else(|| chrono::Utc::now().timestamp());

        // Cross-source duplicate detection keys on the destination, not the
        // feed it arrived through — issues #144 / #334 / #533.
        let dedupe_hash = hash(&[
            &normalise_link(link.as_deref().unwrap_or("")),
            &title.to_lowercase(),
        ]);

        entries.push(ParsedEntry {
            guid,
            title,
            link,
            author: e
                .authors
                .iter()
                .map(|a| a.name.trim())
                // some feeds put the literal element name in there
                .find(|n| !n.is_empty() && !n.eq_ignore_ascii_case("author"))
                .map(str::to_owned),
            published,
            content,
            snippet,
            thumbnail,
            dedupe_hash,
        });
    }

    Ok(FetchOutcome {
        entries,
        feed_title,
        site_url,
        icon_url,
        etag,
        last_modified,
        not_modified: false,
    })
}

/// The allowlist. Anything not named here is dropped, so feed HTML can never
/// introduce an element the renderer has to reason about.
fn sanitise(html: &str, base: Option<&url::Url>) -> String {
    let mut tags: HashSet<&str> = HashSet::new();
    for t in [
        "p", "br", "hr", "span", "div", "a", "em", "i", "strong", "b", "u", "s", "sub", "sup",
        "blockquote", "q", "cite", "code", "pre", "kbd", "samp", "var", "mark", "small",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li", "dl", "dt", "dd",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "img", "figure", "figcaption", "picture", "source", "video", "audio", "track",
        "abbr", "time", "data", "ruby", "rt", "rp", "wbr",
    ] {
        tags.insert(t);
    }

    let mut attrs: HashMap<&str, HashSet<&str>> = HashMap::new();
    attrs.insert("a", ["href", "title"].into_iter().collect());
    attrs.insert("img", ["src", "alt", "title", "width", "height", "srcset"].into_iter().collect());
    attrs.insert("source", ["src", "srcset", "type", "media"].into_iter().collect());
    attrs.insert("video", ["src", "poster", "width", "height", "controls"].into_iter().collect());
    attrs.insert("audio", ["src", "controls"].into_iter().collect());
    attrs.insert("track", ["src", "kind", "srclang", "label"].into_iter().collect());
    attrs.insert("td", ["colspan", "rowspan"].into_iter().collect());
    attrs.insert("th", ["colspan", "rowspan", "scope"].into_iter().collect());
    attrs.insert("time", ["datetime"].into_iter().collect());
    attrs.insert("abbr", ["title"].into_iter().collect());

    let mut builder = ammonia::Builder::default();
    builder
        .tags(tags)
        .tag_attributes(attrs)
        .link_rel(Some("noopener noreferrer nofollow"))
        .url_schemes(["http", "https", "mailto", "data"].into_iter().collect());
    if let Some(b) = base {
        builder.url_relative(ammonia::UrlRelative::RewriteWithBase(b.clone()));
    }
    builder.clean(html).to_string()
}

fn snippet_of(html: &str) -> String {
    let text = TAG.replace_all(html, " ");
    let text = decode_entities(&text);
    let text = WS.replace_all(&text, " ");
    let trimmed = text.trim();
    if trimmed.chars().count() <= 320 {
        trimmed.to_owned()
    } else {
        let cut: String = trimmed.chars().take(320).collect();
        match cut.rfind(' ') {
            Some(i) => format!("{}…", &cut[..i]),
            None => format!("{cut}…"),
        }
    }
}

fn first_image(html: &str) -> Option<String> {
    IMG_SRC
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_owned())
        .filter(|s| !s.starts_with("data:"))
}

fn absolutise(href: &str, base: Option<&url::Url>) -> String {
    if href.starts_with("http://") || href.starts_with("https://") || href.starts_with("data:") {
        return href.to_owned();
    }
    base.and_then(|b| b.join(href).ok())
        .map(|u| u.to_string())
        .unwrap_or_else(|| href.to_owned())
}

/// Strip tracking noise so the same article through two feeds hashes alike.
fn normalise_link(link: &str) -> String {
    match url::Url::parse(link) {
        Ok(mut u) => {
            let keep: Vec<(String, String)> = u
                .query_pairs()
                .filter(|(k, _)| {
                    let k = k.to_lowercase();
                    !(k.starts_with("utm_") || k == "fbclid" || k == "gclid" || k == "ref")
                })
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            u.set_fragment(None);
            {
                let mut qp = u.query_pairs_mut();
                qp.clear();
                for (k, v) in &keep {
                    qp.append_pair(k, v);
                }
            }
            if u.query() == Some("") {
                u.set_query(None);
            }
            u.to_string().trim_end_matches('/').to_lowercase()
        }
        Err(_) => link.trim_end_matches('/').to_lowercase(),
    }
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
}

fn hash(parts: &[&str]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p.as_bytes());
        h.update([0u8]);
    }
    format!("{:x}", h.finalize())[..32].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact construct that bricked Fluent Reader three times.
    #[test]
    fn geolocation_cannot_survive_sanitising() {
        let hostile = r#"<p>a <geolocation> b</p><script>alert(1)</script>"#;
        let out = sanitise(hostile, None);
        assert!(!out.contains("<geolocation"), "unknown element survived: {out}");
        assert!(!out.contains("<script"), "script survived: {out}");
        assert!(out.contains("a") && out.contains("b"));
    }

    #[test]
    fn tracking_params_do_not_defeat_dedupe() {
        let a = normalise_link("https://example.com/post?utm_source=rss&id=7");
        let b = normalise_link("https://example.com/post?id=7");
        assert_eq!(a, b);
    }

    #[test]
    fn snippet_strips_markup() {
        let s = snippet_of("<p>Hello <b>there</b></p>");
        assert_eq!(s, "Hello there");
    }
}
