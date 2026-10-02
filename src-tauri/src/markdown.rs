//! HTML to Markdown, for the "Save as Markdown" export.
//!
//! The input is the output of [`crate::feed::sanitise`], so it is a known
//! allowlist of tags rather than arbitrary feed HTML. That is also why this
//! lives in Rust: the webview should never have to parse an article in order
//! to export one.

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

/// Elements that force a blank line around themselves.
const BLOCK: &[&str] = &[
    "p",
    "div",
    "blockquote",
    "figure",
    "figcaption",
    "table",
    "dl",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
];

struct List {
    ordered: bool,
    index: usize,
}

/// Convert sanitised article HTML into Markdown.
pub fn from_html(html: &str) -> String {
    let mut reader = Reader::from_str(html);
    reader.config_mut().check_end_names = false;
    reader.config_mut().trim_text(false);

    let mut out = String::new();
    let mut lists: Vec<List> = Vec::new();
    let mut link: Option<String> = None;
    let mut in_pre = false;
    let mut buf = Vec::new();

    loop {
        let event = match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) | Err(_) => break,
            Ok(ev) => ev,
        };
        match event {
            Event::Start(e) => open(&e, &mut out, &mut lists, &mut link, &mut in_pre),
            Event::Empty(e) => {
                open(&e, &mut out, &mut lists, &mut link, &mut in_pre);
                close(
                    &local_name(e.name().as_ref()),
                    &mut out,
                    &mut lists,
                    &mut link,
                    &mut in_pre,
                );
            }
            Event::End(e) => close(
                &local_name(e.name().as_ref()),
                &mut out,
                &mut lists,
                &mut link,
                &mut in_pre,
            ),
            Event::Text(t) => {
                let raw = t.unescape().unwrap_or_default().into_owned();
                let text = if in_pre { raw } else { collapse(&raw) };
                if text.is_empty() {
                    continue;
                }
                // An open <a> gets its bracket only once there is link text.
                if link.is_some() && !out.ends_with('[') {
                    out.push('[');
                }
                out.push_str(&if in_pre { text } else { escape(&text) });
            }
            Event::CData(t) => out.push_str(&String::from_utf8_lossy(&t)),
            _ => {}
        }
        buf.clear();
    }

    tidy(&out)
}

fn open(
    e: &BytesStart,
    out: &mut String,
    lists: &mut Vec<List>,
    link: &mut Option<String>,
    in_pre: &mut bool,
) {
    let name = local_name(e.name().as_ref());
    match name.as_str() {
        "br" => out.push_str("  \n"),
        "hr" => {
            blank_line(out);
            out.push_str("---");
            blank_line(out);
        }
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            blank_line(out);
            let level = name[1..].parse::<usize>().unwrap_or(1);
            out.push_str(&"#".repeat(level));
            out.push(' ');
        }
        "strong" | "b" => out.push_str("**"),
        "em" | "i" => out.push('*'),
        "s" => out.push_str("~~"),
        "code" if !*in_pre => out.push('`'),
        "pre" => {
            blank_line(out);
            out.push_str("```\n");
            *in_pre = true;
        }
        "blockquote" => {
            blank_line(out);
            out.push_str("> ");
        }
        "ul" | "ol" => {
            blank_line(out);
            lists.push(List {
                ordered: name == "ol",
                index: 0,
            });
        }
        "li" => {
            trim_trailing_spaces(out);
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(&"  ".repeat(lists.len().saturating_sub(1)));
            match lists.last_mut() {
                Some(l) if l.ordered => {
                    l.index += 1;
                    out.push_str(&format!("{}. ", l.index));
                }
                _ => out.push_str("- "),
            }
        }
        "a" => *link = attr(e, "href"),
        "img" => {
            if let Some(src) = attr(e, "src") {
                let alt = attr(e, "alt").unwrap_or_default();
                out.push_str(&format!("![{alt}]({src})"));
            }
        }
        // Tables degrade to piped cell text rather than a misaligned grid.
        "tr" => blank_line(out),
        "td" | "th" => out.push_str(" | "),
        n if BLOCK.contains(&n) => blank_line(out),
        _ => {}
    }
}

fn close(
    name: &str,
    out: &mut String,
    lists: &mut Vec<List>,
    link: &mut Option<String>,
    in_pre: &mut bool,
) {
    match name {
        "strong" | "b" => out.push_str("**"),
        "em" | "i" => out.push('*'),
        "s" => out.push_str("~~"),
        "code" if !*in_pre => out.push('`'),
        "pre" => {
            *in_pre = false;
            if !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str("```");
            blank_line(out);
        }
        "a" => {
            if let Some(href) = link.take() {
                if out.ends_with('[') {
                    out.pop();
                } else {
                    out.push_str(&format!("]({href})"));
                }
            }
        }
        "ul" | "ol" => {
            lists.pop();
            blank_line(out);
        }
        n if BLOCK.contains(&n) => blank_line(out),
        _ => {}
    }
}

/// A full document: YAML front matter, a title, then the body.
pub fn document(
    title: &str,
    author: Option<&str>,
    source: &str,
    link: Option<&str>,
    published: &str,
    html: &str,
) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("title: {}\n", yaml(title)));
    if let Some(a) = author {
        s.push_str(&format!("author: {}\n", yaml(a)));
    }
    s.push_str(&format!("source: {}\n", yaml(source)));
    if let Some(l) = link {
        s.push_str(&format!("url: {}\n", yaml(l)));
    }
    s.push_str(&format!("date: {}\n", yaml(published)));
    s.push_str("---\n\n");
    s.push_str(&format!("# {title}\n\n"));
    s.push_str(&from_html(html));
    s.push('\n');
    s
}

fn yaml(v: &str) -> String {
    format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
}

fn local_name(raw: &[u8]) -> String {
    let s = String::from_utf8_lossy(raw);
    s.rsplit(':').next().unwrap_or("").to_ascii_lowercase()
}

fn attr(e: &BytesStart, key: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if local_name(a.key.as_ref()) != key {
            return None;
        }
        let v = a
            .unescape_value()
            .map(|v| v.trim().to_string())
            .unwrap_or_default();
        (!v.is_empty()).then_some(v)
    })
}

fn collapse(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            space = true;
            continue;
        }
        if space && !out.is_empty() {
            out.push(' ');
        }
        space = false;
        out.push(c);
    }
    if space && !out.is_empty() {
        out.push(' ');
    }
    out
}

fn escape(s: &str) -> String {
    s.replace('[', "\\[").replace(']', "\\]")
}

fn blank_line(out: &mut String) {
    trim_trailing_spaces(out);
    if out.is_empty() {
        return;
    }
    while !out.ends_with("\n\n") {
        out.push('\n');
    }
}

fn trim_trailing_spaces(out: &mut String) {
    while out.ends_with(' ') || out.ends_with('\t') {
        out.pop();
    }
}

/// Collapse runs of blank lines down to one and trim the ends.
fn tidy(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut blanks = 0;
    for line in s.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            blanks += 1;
            if blanks > 1 {
                continue;
            }
        } else {
            blanks = 0;
        }
        out.push_str(line);
        out.push('\n');
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headings_links_and_lists_survive() {
        let html = "<h2>Title</h2><p>Hello <strong>world</strong> and \
                    <a href=\"https://example.com\">a link</a>.</p>\
                    <ul><li>one</li><li>two</li></ul>";
        let md = from_html(html);
        assert!(md.contains("## Title"), "{md}");
        assert!(md.contains("**world**"), "{md}");
        assert!(md.contains("[a link](https://example.com)"), "{md}");
        assert!(md.contains("- one"), "{md}");
        assert!(md.contains("- two"), "{md}");
    }

    #[test]
    fn ordered_lists_are_numbered() {
        let md = from_html("<ol><li>first</li><li>second</li></ol>");
        assert!(md.contains("1. first"), "{md}");
        assert!(md.contains("2. second"), "{md}");
    }

    #[test]
    fn code_blocks_keep_their_whitespace() {
        let md = from_html("<pre><code>fn main() {\n    ok();\n}</code></pre>");
        assert!(md.contains("```"), "{md}");
        assert!(md.contains("    ok();"), "{md}");
    }

    #[test]
    fn images_become_image_links() {
        let md = from_html("<p><img src=\"https://e.com/a.png\" alt=\"cat\"></p>");
        assert_eq!(md, "![cat](https://e.com/a.png)");
    }

    #[test]
    fn hostile_input_cannot_panic() {
        for s in [
            "<p>unclosed",
            "<<>>",
            "<a href>x</a>",
            "",
            "&amp;&#x3c;",
            "<li>loose",
        ] {
            let _ = from_html(s);
        }
    }

    #[test]
    fn front_matter_quotes_are_escaped() {
        let doc = document(
            "A \"quoted\" title",
            None,
            "Feed",
            None,
            "2026-01-01",
            "<p>x</p>",
        );
        assert!(doc.contains("title: \"A \\\"quoted\\\" title\""), "{doc}");
    }
}
