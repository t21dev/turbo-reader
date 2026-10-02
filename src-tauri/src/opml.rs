//! OPML import/export. Keeps the group → feed nesting both ways, so a list
//! exported here reopens in any other reader with its folders intact.

use anyhow::Result;
use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Debug, Clone)]
pub struct OpmlFeed {
    pub title: String,
    pub xml_url: String,
    /// The site behind the feed, kept so an export round-trips what it read.
    #[allow(dead_code)]
    pub html_url: Option<String>,
    pub group: Option<String>,
}

pub fn parse(xml: &str) -> Result<Vec<OpmlFeed>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut feeds = Vec::new();
    let mut group_stack: Vec<String> = Vec::new();
    // one entry per open <outline>: did it push a folder onto group_stack?
    let mut opened: Vec<bool> = Vec::new();
    let mut buf = Vec::new();

    loop {
        let event = reader.read_event_into(&mut buf)?;

        // `Empty` is a self-closing <outline/>, always a leaf and never a folder
        let (tag, self_closing) = match &event {
            Event::Start(e) => (Some(e.to_owned()), false),
            Event::Empty(e) => (Some(e.to_owned()), true),
            _ => (None, false),
        };

        if let Some(e) = tag {
            if e.name().as_ref() != b"outline" {
                buf.clear();
                continue;
            }
            let (mut xml_url, mut text, mut title, mut html_url) = (None, None, None, None);
            for a in e.attributes().flatten() {
                let key = a.key.as_ref().to_ascii_lowercase();
                let val = a.unescape_value().unwrap_or_default().to_string();
                match key.as_slice() {
                    b"xmlurl" => xml_url = Some(val),
                    b"text" => text = Some(val),
                    b"title" => title = Some(val),
                    b"htmlurl" => html_url = Some(val),
                    _ => {}
                }
            }
            let label = text.or(title).unwrap_or_default();
            let mut pushed_group = false;

            match xml_url {
                Some(url) if !url.trim().is_empty() => feeds.push(OpmlFeed {
                    title: if label.trim().is_empty() {
                        url.clone()
                    } else {
                        label
                    },
                    xml_url: url,
                    html_url,
                    group: group_stack.last().cloned(),
                }),
                // a titled outline with no xmlUrl that can hold children is a folder
                _ if !self_closing && !label.trim().is_empty() => {
                    group_stack.push(label);
                    pushed_group = true;
                }
                _ => {}
            }
            if !self_closing {
                opened.push(pushed_group);
            }
        } else {
            match event {
                Event::End(e) if e.name().as_ref() == b"outline" => {
                    // only unwind the folder stack if this element opened one
                    if opened.pop().unwrap_or(false) {
                        group_stack.pop();
                    }
                }
                Event::Eof => break,
                _ => {}
            }
        }
        buf.clear();
    }
    Ok(feeds)
}

pub fn build(groups: &[(String, Vec<(String, String)>)], ungrouped: &[(String, String)]) -> String {
    fn esc(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<opml version=\"1.0\">\n  <head>\n    <title>Turbo Reader Export</title>\n  </head>\n  <body>\n",
    );
    for (group, feeds) in groups {
        out.push_str(&format!(
            "    <outline text=\"{0}\" title=\"{0}\">\n",
            esc(group)
        ));
        for (name, url) in feeds {
            out.push_str(&format!(
                "      <outline type=\"rss\" text=\"{0}\" title=\"{0}\" xmlUrl=\"{1}\"/>\n",
                esc(name),
                esc(url)
            ));
        }
        out.push_str("    </outline>\n");
    }
    for (name, url) in ungrouped {
        out.push_str(&format!(
            "    <outline type=\"rss\" text=\"{0}\" title=\"{0}\" xmlUrl=\"{1}\"/>\n",
            esc(name),
            esc(url)
        ));
    }
    out.push_str("  </body>\n</opml>\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_nested_groups() {
        let xml = r#"<opml version="1.0"><body>
            <outline text="News">
              <outline type="rss" text="A" xmlUrl="https://a.example/feed"/>
            </outline>
            <outline type="rss" text="B" xmlUrl="https://b.example/feed"/>
          </body></opml>"#;
        let feeds = parse(xml).unwrap();
        assert_eq!(feeds.len(), 2);
        assert_eq!(feeds[0].group.as_deref(), Some("News"));
        assert_eq!(feeds[1].group, None);
    }

    #[test]
    fn round_trips() {
        let groups = vec![(
            "News".to_string(),
            vec![("A".to_string(), "https://a.example/feed".to_string())],
        )];
        let xml = build(&groups, &[]);
        let back = parse(&xml).unwrap();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].group.as_deref(), Some("News"));
    }
}
