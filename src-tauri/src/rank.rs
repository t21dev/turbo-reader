//! Deciding what the home page shows, without a model.
//!
//! This is the whole product for anyone who never adds an API key, so it has
//! to be good on its own rather than a degraded mode. Every term is something
//! the reader can see and change: how fresh it is, whether they have read it,
//! how often they open that feed, and their own interest and mute lists.
//!
//! An assistant can re-rank what comes out of here later, but it never gets to
//! decide what exists. See docs/ai-assistant-spec.md.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

/// Freshness halves every this many seconds. Eighteen hours means yesterday
/// morning still shows up, and last week does not.
const HALF_LIFE: f64 = 18.0 * 3600.0;

pub struct Weights {
    pub recency: f64,
    pub unread: f64,
    /// A feed the reader pinned. Weighted above affinity because pinning is a
    /// stated preference, where affinity is only an inferred one.
    pub favourite: f64,
    pub affinity: f64,
    pub interest: f64,
    pub thumbnail: f64,
    pub duplicate: f64,
    pub mute: f64,
}

impl Default for Weights {
    fn default() -> Self {
        Self {
            recency: 1.0,
            unread: 0.35,
            favourite: 0.9,
            affinity: 0.5,
            interest: 1.2,
            thumbnail: 0.08,
            duplicate: 0.6,
            mute: 4.0,
        }
    }
}

/// One article's inputs. Deliberately plain data so the scorer can be tested
/// without a database.
pub struct Candidate<'a> {
    pub title: &'a str,
    pub snippet: &'a str,
    pub published: i64,
    pub read: bool,
    pub has_thumbnail: bool,
    pub is_duplicate: bool,
    /// From a feed the reader pinned.
    pub favourite: bool,
    pub source_id: i64,
}

/// A user's interest or mute list, compiled once per change.
///
/// A line wrapped in slashes is a regular expression; anything else is a
/// case-insensitive substring. Most people want `kubernetes`, not
/// `(?i)\bkubernetes\b`, and the ones who want the second can have it.
#[derive(Default)]
pub struct Matcher {
    plain: Vec<String>,
    patterns: Vec<Regex>,
}

impl Matcher {
    pub fn parse(text: &str) -> Self {
        let mut m = Matcher::default();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            match regex_body(line) {
                // An unparsable expression is skipped rather than failing the
                // whole list: one bad line should not silence the other nine.
                Some(body) => {
                    if let Ok(re) = Regex::new(&format!("(?i){body}")) {
                        m.patterns.push(re);
                    }
                }
                None => m.plain.push(line.to_lowercase()),
            }
        }
        m
    }

    pub fn is_empty(&self) -> bool {
        self.plain.is_empty() && self.patterns.is_empty()
    }

    /// How many distinct rules matched. More rules hitting is a stronger
    /// signal than one rule hitting repeatedly, which would just reward
    /// a word being said a lot.
    pub fn hits(&self, haystack_lower: &str) -> usize {
        let plain = self
            .plain
            .iter()
            .filter(|needle| haystack_lower.contains(needle.as_str()))
            .count();
        let re = self
            .patterns
            .iter()
            .filter(|re| re.is_match(haystack_lower))
            .count();
        plain + re
    }
}

fn regex_body(line: &str) -> Option<&str> {
    let body = line.strip_prefix('/')?.strip_suffix('/')?;
    (!body.is_empty()).then_some(body)
}

/// How much this reader likes each feed, from the reading they have already
/// done. No new tracking: it is a ratio over rows that already exist.
///
/// A feed whose articles get opened scores above one; one that gets marked
/// read in bulk, or never touched, scores below.
pub fn affinity(opened: i64, total: i64) -> f64 {
    if total <= 0 {
        return 0.0;
    }
    // Pulled toward the middle when there is little evidence, so a feed added
    // yesterday does not win the page on a single click.
    const PRIOR: f64 = 8.0;
    let rate = (opened as f64 + PRIOR * 0.25) / (total as f64 + PRIOR);
    (rate - 0.25).clamp(-0.25, 0.75) / 0.75
}

static WHITESPACE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

pub fn score(
    c: &Candidate,
    now: i64,
    affinities: &HashMap<i64, f64>,
    interests: &Matcher,
    mutes: &Matcher,
    w: &Weights,
) -> f64 {
    let age = (now - c.published).max(0) as f64;
    let mut s = w.recency * 0.5f64.powf(age / HALF_LIFE);

    if !c.read {
        s += w.unread;
    }
    if c.has_thumbnail {
        s += w.thumbnail;
    }
    if c.favourite {
        s += w.favourite;
    }
    if c.is_duplicate {
        s -= w.duplicate;
    }
    s += w.affinity * affinities.get(&c.source_id).copied().unwrap_or(0.0);

    if !interests.is_empty() || !mutes.is_empty() {
        let hay = haystack(c);
        if !interests.is_empty() {
            // Diminishing: three matching rules is better than one, not three
            // times better.
            let hits = interests.hits(&hay) as f64;
            s += w.interest * (1.0 + hits).ln();
        }
        if !mutes.is_empty() && mutes.hits(&hay) > 0 {
            s -= w.mute;
        }
    }
    s
}

fn haystack(c: &Candidate) -> String {
    let joined = format!("{} {}", c.title, c.snippet);
    WHITESPACE.replace_all(&joined, " ").to_lowercase()
}

/// Why an article is where it is, for the "why this" tooltip. The ranking has
/// to be explainable or it is just an algorithm by another name.
pub fn explain(c: &Candidate, now: i64, interests: &Matcher, mutes: &Matcher) -> String {
    let mut parts: Vec<String> = Vec::new();
    let hours = ((now - c.published).max(0) as f64 / 3600.0).round() as i64;
    parts.push(match hours {
        0 => "just in".into(),
        1 => "an hour old".into(),
        h if h < 24 => format!("{h} hours old"),
        h => format!("{} days old", h / 24),
    });
    if c.favourite {
        parts.push("a feed you pinned".into());
    }
    if !c.read {
        parts.push("unread".into());
    }
    if !interests.is_empty() {
        let hits = interests.hits(&haystack(c));
        if hits > 0 {
            parts.push(format!(
                "matches {hits} of your interests",
                hits = if hits == 1 {
                    "1".into()
                } else {
                    hits.to_string()
                }
            ));
        }
    }
    if !mutes.is_empty() && mutes.hits(&haystack(c)) > 0 {
        parts.push("muted".into());
    }
    if c.is_duplicate {
        parts.push("also in another feed".into());
    }
    parts.join(" · ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(title: &str, published: i64) -> Candidate<'_> {
        Candidate {
            title,
            snippet: "",
            published,
            read: false,
            has_thumbnail: false,
            is_duplicate: false,
            favourite: false,
            source_id: 1,
        }
    }

    const NOW: i64 = 1_800_000_000;

    fn plain_score(c: &Candidate) -> f64 {
        score(
            c,
            NOW,
            &HashMap::new(),
            &Matcher::default(),
            &Matcher::default(),
            &Weights::default(),
        )
    }

    #[test]
    fn fresher_beats_older() {
        let new = candidate("a", NOW - 3600);
        let old = candidate("b", NOW - 7 * 86400);
        assert!(plain_score(&new) > plain_score(&old));
    }

    #[test]
    fn a_pinned_feed_outranks_an_equally_fresh_one() {
        let plain = candidate("a", NOW - 3600);
        let mut pinned = candidate("a", NOW - 3600);
        pinned.favourite = true;
        assert!(plain_score(&pinned) > plain_score(&plain));
    }

    /// Pinning should lift a feed, not pin it to the top regardless of age.
    /// A week-old favourite still loses to something from this morning.
    #[test]
    fn pinning_is_a_thumb_on_the_scale_not_an_override() {
        let mut stale_favourite = candidate("a", NOW - 7 * 86400);
        stale_favourite.favourite = true;
        let fresh = candidate("b", NOW - 1800);
        assert!(plain_score(&fresh) > plain_score(&stale_favourite));
    }

    #[test]
    fn a_mute_still_beats_a_pin() {
        let mut pinned = candidate("Crypto moons again", NOW);
        pinned.favourite = true;
        let muted = score(
            &pinned,
            NOW,
            &HashMap::new(),
            &Matcher::default(),
            &Matcher::parse("crypto"),
            &Weights::default(),
        );
        assert!(
            muted < 0.0,
            "an explicit mute outranks an explicit pin: {muted}"
        );
    }

    #[test]
    fn read_articles_rank_below_unread() {
        let unread = candidate("a", NOW - 3600);
        let mut read = candidate("a", NOW - 3600);
        read.read = true;
        assert!(plain_score(&unread) > plain_score(&read));
    }

    #[test]
    fn a_mute_sinks_an_otherwise_perfect_article() {
        let fresh = candidate("Rust 2.0 released", NOW);
        let mutes = Matcher::parse("rust");
        let muted = score(
            &fresh,
            NOW,
            &HashMap::new(),
            &Matcher::default(),
            &mutes,
            &Weights::default(),
        );
        let week_old = plain_score(&candidate("anything", NOW - 7 * 86400));
        assert!(
            muted < week_old,
            "muted {muted} should sink below {week_old}"
        );
    }

    #[test]
    fn an_interest_lifts_an_older_article_over_a_newer_one() {
        let interests = Matcher::parse("kubernetes");
        let w = Weights::default();
        let wanted = score(
            &candidate("Kubernetes at scale", NOW - 20 * 3600),
            NOW,
            &HashMap::new(),
            &interests,
            &Matcher::default(),
            &w,
        );
        let fresh_noise = score(
            &candidate("Unrelated", NOW - 3600),
            NOW,
            &HashMap::new(),
            &interests,
            &Matcher::default(),
            &w,
        );
        assert!(wanted > fresh_noise);
    }

    #[test]
    fn slashes_mean_a_regular_expression() {
        let m = Matcher::parse(r"/\brust(lang)?\b/");
        assert_eq!(m.hits("rustlang is fine"), 1);
        assert_eq!(m.hits("rust is fine"), 1);
        assert_eq!(
            m.hits("trust me"),
            0,
            "a bare substring rule would have fired on \"trust\""
        );
    }

    #[test]
    fn a_bare_line_is_a_substring() {
        let m = Matcher::parse("rust");
        assert_eq!(m.hits("trust me"), 1);
    }

    #[test]
    fn a_broken_expression_does_not_take_the_list_with_it() {
        let m = Matcher::parse("/unclosed([/\ngood");
        assert_eq!(m.hits("a good line"), 1);
    }

    #[test]
    fn comments_and_blank_lines_are_ignored() {
        let m = Matcher::parse("# a note\n\n  rust  \n");
        assert_eq!(m.hits("rust"), 1);
        assert_eq!(m.hits("a note"), 0);
    }

    #[test]
    fn affinity_rewards_feeds_you_actually_open() {
        let loved = affinity(40, 50);
        let ignored = affinity(0, 50);
        assert!(loved > ignored);
        assert!(loved <= 1.0 && ignored >= -1.0);
    }

    #[test]
    fn affinity_is_cautious_about_thin_evidence() {
        // One click out of one article should not outrank a long record.
        assert!(affinity(1, 1) < affinity(40, 50));
    }

    #[test]
    fn affinity_of_nothing_is_neutral() {
        assert_eq!(affinity(0, 0), 0.0);
    }

    #[test]
    fn explain_says_something_useful() {
        let interests = Matcher::parse("rust");
        let text = explain(
            &candidate("Rust news", NOW - 3600),
            NOW,
            &interests,
            &Matcher::default(),
        );
        assert!(text.contains("hour"), "{text}");
        assert!(text.contains("unread"), "{text}");
        assert!(text.contains("interest"), "{text}");
    }
}
