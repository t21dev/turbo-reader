//! "Load full content": fetch the article's own page and pull the body out.
//!
//! Many feeds publish a teaser and nothing else. Fluent Reader solves this by
//! loading the page in a webview; doing it here means the extraction never
//! touches the UI process, and the result goes through [`feed::sanitise`]
//! before the window ever sees it.
//!
//! The extractor is a readability-style heuristic, not a browser: find the
//! candidate containers, score them on how much prose they hold versus how
//! much of that prose is link text, and keep the winner.

use once_cell::sync::Lazy;
use regex::Regex;
use url::Url;

use crate::feed;

/// Furniture and executable content, stripped before anything is scored. One
/// regex per tag, because `regex` has no backreference to close the pair with.
static SCRIPTISH: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        "script", "style", "noscript", "svg", "iframe", "form", "nav", "header", "footer", "aside",
        "template",
    ]
    .iter()
    .map(|t| Regex::new(&format!(r"(?is)<{t}\b[^>]*>.*?</\s*{t}\s*>")).unwrap())
    .collect()
});
static COMMENT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)<!--.*?-->").unwrap());
static TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)<[^>]*>").unwrap());
static ANCHOR: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<a\b[^>]*>.*?</\s*a\s*>").unwrap());
static PARAGRAPH: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<p\b").unwrap());

/// Containers worth scoring, in the order we prefer them when scores tie.
const CONTAINERS: &[&str] = &["article", "main", "section", "div"];

/// Class and id fragments that mark a container as the article body.
const GOOD: &[&str] = &[
    "article",
    "articlebody",
    "article-body",
    "post-content",
    "postcontent",
    "entry-content",
    "entry-body",
    "story-body",
    "storybody",
    "post-body",
    "content__article",
    "main-content",
    "rich-text",
    "markdown-body",
    "prose",
];

/// Fragments that mark a container as furniture, never the body.
const BAD: &[&str] = &[
    "comment",
    "share",
    "sidebar",
    "footer",
    "header",
    "nav",
    "menu",
    "promo",
    "related",
    "recommend",
    "newsletter",
    "subscribe",
    "paywall",
    "cookie",
    "banner",
    "advert",
    "sponsor",
    "social",
    "breadcrumb",
    "pagination",
    "tags",
    "meta",
];

/// Fetch `url` and return sanitised article HTML, or `None` if nothing on the
/// page looks more substantial than what the feed already gave us.
pub async fn fetch(client: &reqwest::Client, url: &str) -> Result<Option<String>, String> {
    let res = client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !res.status().is_success() {
        return Err(refused(url, res.status()));
    }
    let base = Url::parse(res.url().as_str()).ok();
    let html = res.text().await.map_err(|err| err.to_string())?;
    Ok(extract(&html).map(|body| feed::sanitise(&body, base.as_ref())))
}

/// Why a page could not be loaded, in words for the reader's message. 401,
/// 403, 429 and 503 are what bot checks answer an app with: the site wants a
/// person in a browser, which no request from here can be.
fn refused(url: &str, status: reqwest::StatusCode) -> String {
    let site = Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_string()))
        .unwrap_or_else(|| "The site".into());
    match status.as_u16() {
        401 | 403 | 429 | 503 => format!(
            "{site} only shows the full article in a browser. Press o to read it there."
        ),
        404 | 410 => format!("{site} no longer has this article."),
        _ => format!("{site} could not send the page ({status}). Press o to read it in your browser."),
    }
}

/// Pick the densest prose container in a page. Public for the tests.
pub fn extract(html: &str) -> Option<String> {
    let mut cleaned = COMMENT.replace_all(html, " ").into_owned();
    for re in SCRIPTISH.iter() {
        cleaned = re.replace_all(&cleaned, " ").into_owned();
    }

    let mut best: Option<(f64, String)> = None;
    for tag in CONTAINERS {
        for block in blocks(&cleaned, tag) {
            let score = score(&block);
            if score <= 0.0 {
                continue;
            }
            if best.as_ref().map_or(true, |(b, _)| score > *b) {
                best = Some((score, block));
            }
        }
    }

    // A win under roughly a paragraph of prose is not a win.
    best.filter(|(_, b)| text_len(b) >= 240).map(|(_, b)| b)
}

/// Every balanced `<tag>...</tag>` region in `html`, outermost first.
fn blocks(html: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}");
    let close = format!("</{tag}");
    let bytes = html.as_bytes();
    let lower = html.to_ascii_lowercase();
    let mut out = Vec::new();
    let mut i = 0usize;

    while let Some(rel) = lower[i..].find(&open) {
        let start = i + rel;
        // Guard against <articlefoo>; the name has to end here.
        let after = bytes.get(start + open.len()).copied().unwrap_or(b'>');
        if after.is_ascii_alphanumeric() || after == b'-' || after == b'_' {
            i = start + open.len();
            continue;
        }
        let Some(end) = balanced_end(&lower, start, &open, &close) else {
            break;
        };
        out.push(html[start..end].to_string());
        if out.len() >= 200 {
            break;
        }
        i = start + open.len();
    }
    out
}

/// Index just past the closing tag that matches the opener at `start`.
fn balanced_end(lower: &str, start: usize, open: &str, close: &str) -> Option<usize> {
    let mut depth = 0i32;
    let mut i = start;
    while i < lower.len() {
        let next_open = lower[i..].find(open).map(|p| i + p);
        let next_close = lower[i..].find(close).map(|p| i + p);
        match (next_open, next_close) {
            (_, None) => return None,
            (Some(o), Some(c)) if o < c => {
                depth += 1;
                i = o + open.len();
            }
            (_, Some(c)) => {
                depth -= 1;
                let end = lower[c..].find('>').map(|p| c + p + 1)?;
                if depth == 0 {
                    return Some(end);
                }
                i = end;
            }
        }
    }
    None
}

/// Prose length, discounted by link density and by furniture in the attributes.
fn score(block: &str) -> f64 {
    let total = text_len(block) as f64;
    if total < 200.0 {
        return 0.0;
    }
    let linked = ANCHOR
        .find_iter(block)
        .map(|m| text_len(m.as_str()))
        .sum::<usize>() as f64;
    let link_density = linked / total;
    if link_density > 0.45 {
        return 0.0;
    }

    // Only the opening tag's own attributes decide good or bad; a nested
    // "related posts" div should not disqualify the article that contains it.
    let head = &block[..block.find('>').map(|p| p + 1).unwrap_or(block.len())];
    let head = head.to_ascii_lowercase();
    if BAD.iter().any(|b| head.contains(b)) {
        return 0.0;
    }
    let bonus = if GOOD.iter().any(|g| head.contains(g)) {
        1.6
    } else {
        1.0
    };

    let paragraphs = PARAGRAPH.find_iter(block).count() as f64;
    total * (1.0 - link_density) * bonus * (1.0 + paragraphs.min(40.0) / 40.0)
}

fn text_len(html: &str) -> usize {
    TAG.replace_all(html, " ")
        .split_whitespace()
        .map(str::len)
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(body: &str) -> String {
        format!(
            "<html><head><title>t</title><style>x{{}}</style></head><body>\
             <nav><a href=\"/a\">one</a><a href=\"/b\">two</a></nav>{body}\
             <footer><a href=\"/c\">three</a></footer></body></html>"
        )
    }

    const PROSE: &str = "Sanitising in Rust means the webview never parses feed markup. \
        That is the whole argument for the architecture, repeated here at length so the \
        extractor has something substantial to find and score above the page furniture. ";

    #[test]
    fn finds_the_article_body() {
        let html = page(&format!(
            "<div class=\"sidebar\"><p>{PROSE}</p></div>\
             <article class=\"post-content\"><p>{PROSE}{PROSE}</p></article>"
        ));
        let got = extract(&html).expect("an article");
        assert!(got.contains("post-content"), "{got}");
        assert!(!got.contains("sidebar"), "{got}");
    }

    #[test]
    fn link_farms_do_not_win() {
        let links = "<a href=\"/x\">a fairly long link label goes here</a> ".repeat(40);
        let html = page(&format!("<div class=\"related\">{links}</div>"));
        assert!(extract(&html).is_none());
    }

    #[test]
    fn a_teaser_only_page_yields_nothing() {
        assert!(extract(&page("<p>Short.</p>")).is_none());
    }

    #[test]
    fn hostile_input_cannot_panic() {
        for s in [
            "<article",
            "</article>",
            "<div><div><div>",
            "",
            "<article>&#x3c;</article>",
        ] {
            let _ = extract(s);
        }
    }
}
