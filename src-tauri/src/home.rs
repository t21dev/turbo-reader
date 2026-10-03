//! The home page: what happened since you last looked.
//!
//! The whole page comes back in one call. Seven queries inside one lock beats
//! seven IPC round trips, and a page that paints in pieces looks broken even
//! when it is fast.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::db;
use crate::rank::{self, Candidate, Matcher, Weights};

/// Which slice of time the page is showing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Window {
    Today,
    Week,
    Month,
}

impl Window {
    /// The unix second this window starts at.
    ///
    /// "Today" means since midnight rather than the last 24 hours, because
    /// that is what people mean by today. The others are rolling, because
    /// nobody thinks in calendar weeks when reading feeds.
    fn since(self, now: i64) -> i64 {
        match self {
            Window::Today => now - now.rem_euclid(86_400),
            Window::Week => now - 7 * 86_400,
            Window::Month => now - 30 * 86_400,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub today: i64,
    pub week: i64,
    pub month: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    /// Midnight of the day, unix seconds.
    pub day: i64,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeItem {
    pub id: i64,
    pub source_id: i64,
    pub source_name: String,
    pub title: String,
    pub link: Option<String>,
    pub published: i64,
    pub snippet: String,
    pub thumbnail: Option<String>,
    pub read: bool,
    pub starred: bool,
    /// Why this one is here, for the tooltip. The ranking has to be
    /// explainable or it is just an algorithm by another name.
    pub why: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Band {
    pub group_id: Option<i64>,
    pub name: String,
    /// "cards" | "compact" | "headlines"
    pub layout: String,
    pub unread: i64,
    pub items: Vec<HomeItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedSource {
    pub id: i64,
    pub name: String,
    pub icon_url: Option<String>,
    pub unread: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Home {
    pub counts: Counts,
    pub buckets: Vec<Bucket>,
    pub pinned: Vec<PinnedSource>,
    pub bands: Vec<Band>,
    /// The line under the date, already chosen. `None` when switched off.
    pub quote: Option<Quote>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub text: String,
    pub author: Option<String>,
}

/// Build the whole page.
pub fn build(
    conn: &Connection,
    window: Window,
    per_band: usize,
    now: i64,
) -> rusqlite::Result<Home> {
    let counts = counts(conn, now)?;
    let buckets = buckets(conn, now, 14)?;
    let pinned = pinned(conn)?;

    let interests = Matcher::parse(&setting(conn, "home_interests"));
    let mutes = Matcher::parse(&setting(conn, "home_mutes"));
    let affinities = affinities(conn)?;
    let favourites = favourite_ids(conn)?;
    let weights = Weights::default();

    let since = window.since(now);
    let mut bands = Vec::new();
    for (group_id, name, layout) in groups(conn)? {
        let items = band_items(
            conn,
            group_id,
            since,
            per_band,
            now,
            &affinities,
            &favourites,
            &interests,
            &mutes,
            &weights,
        )?;
        if items.is_empty() {
            // A band with nothing in it collapses. A home page of empty frames
            // is worse than a shorter one.
            continue;
        }
        let unread = group_unread(conn, group_id)?;
        let layout = layout.unwrap_or_else(|| default_layout(&items).to_string());
        bands.push(Band {
            group_id,
            name,
            layout,
            unread,
            items,
        });
    }

    Ok(Home {
        counts,
        buckets,
        pinned,
        bands,
        quote: None,
    })
}

/// Cards need pictures. A group whose feeds carry none gets headlines instead,
/// decided from what is actually in the database rather than guessed.
fn default_layout(items: &[HomeItem]) -> &'static str {
    let with_art = items.iter().filter(|i| i.thumbnail.is_some()).count();
    if with_art * 2 >= items.len() {
        "cards"
    } else {
        "headlines"
    }
}

fn setting(conn: &Connection, key: &str) -> String {
    db::get_setting_str(conn, key).unwrap_or_default()
}

fn counts(conn: &Connection, now: i64) -> rusqlite::Result<Counts> {
    let at = |since: i64| -> rusqlite::Result<i64> {
        conn.query_row(
            "SELECT COUNT(*) FROM items WHERE hidden = 0 AND published >= ?1",
            params![since],
            |r| r.get(0),
        )
    };
    Ok(Counts {
        today: at(Window::Today.since(now))?,
        week: at(Window::Week.since(now))?,
        month: at(Window::Month.since(now))?,
    })
}

/// Daily totals for the sparkline, oldest first, with empty days present as
/// zero so the shape of the chart is honest.
fn buckets(conn: &Connection, now: i64, days: i64) -> rusqlite::Result<Vec<Bucket>> {
    let midnight = now - now.rem_euclid(86_400);
    let start = midnight - (days - 1) * 86_400;

    let mut stmt = conn.prepare(
        "SELECT (published / 86400) * 86400 AS day, COUNT(*)
           FROM items
          WHERE hidden = 0 AND published >= ?1
          GROUP BY day",
    )?;
    let found: HashMap<i64, i64> = stmt
        .query_map(params![start], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;

    Ok((0..days)
        .map(|i| {
            let day = start + i * 86_400;
            Bucket {
                day,
                count: found.get(&day).copied().unwrap_or(0),
            }
        })
        .collect())
}

/// The ids of pinned feeds, so their articles can be lifted in every band
/// rather than only appearing in the pinned row.
fn favourite_ids(conn: &Connection) -> rusqlite::Result<HashSet<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM sources WHERE pinned = 1")?;
    let rows = stmt
        .query_map([], |r| r.get::<_, i64>(0))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;
    Ok(rows)
}

fn pinned(conn: &Connection) -> rusqlite::Result<Vec<PinnedSource>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.icon_url,
                (SELECT COUNT(*) FROM items i
                  WHERE i.source_id = s.id AND i.read = 0 AND i.hidden = 0)
           FROM sources s
          WHERE s.pinned = 1
          ORDER BY s.pinned_at IS NULL, s.pinned_at, s.name",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PinnedSource {
                id: r.get(0)?,
                name: r.get(1)?,
                icon_url: r.get(2)?,
                unread: r.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

type GroupRow = (Option<i64>, String, Option<String>);

fn groups(conn: &Connection) -> rusqlite::Result<Vec<GroupRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT id, name, home_layout FROM groups ORDER BY {}",
        match db::get_setting_str(conn, "feed_sort").as_deref() {
            Some("alpha") => "name COLLATE NOCASE",
            _ => "position, name COLLATE NOCASE",
        }
    ))?;
    let mut out = stmt
        .query_map([], |r| {
            Ok((Some(r.get::<_, i64>(0)?), r.get(1)?, r.get(2)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    // Feeds that belong to no group still deserve a band.
    let loose: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sources WHERE group_id IS NULL",
        [],
        |r| r.get(0),
    )?;
    if loose > 0 {
        out.push((None, "Ungrouped".to_string(), None));
    }
    Ok(out)
}

fn group_unread(conn: &Connection, group_id: Option<i64>) -> rusqlite::Result<i64> {
    match group_id {
        Some(id) => conn.query_row(
            "SELECT COUNT(*) FROM items i JOIN sources s ON s.id = i.source_id
              WHERE i.read = 0 AND i.hidden = 0 AND s.group_id = ?1",
            params![id],
            |r| r.get(0),
        ),
        None => conn.query_row(
            "SELECT COUNT(*) FROM items i JOIN sources s ON s.id = i.source_id
              WHERE i.read = 0 AND i.hidden = 0 AND s.group_id IS NULL",
            [],
            |r| r.get(0),
        ),
    }
}

/// How much the reader likes each feed, from reading they have already done.
fn affinities(conn: &Connection) -> rusqlite::Result<HashMap<i64, f64>> {
    let mut stmt = conn.prepare(
        "SELECT source_id,
                SUM(CASE WHEN read = 1 AND starred = 1 THEN 1 ELSE 0 END)
                  + SUM(CASE WHEN starred = 1 THEN 1 ELSE 0 END),
                COUNT(*)
           FROM items
          GROUP BY source_id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            let id: i64 = r.get(0)?;
            let opened: i64 = r.get(1)?;
            let total: i64 = r.get(2)?;
            Ok((id, rank::affinity(opened, total)))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    Ok(rows)
}

#[allow(clippy::too_many_arguments)]
fn band_items(
    conn: &Connection,
    group_id: Option<i64>,
    since: i64,
    want: usize,
    now: i64,
    affinities: &HashMap<i64, f64>,
    favourites: &HashSet<i64>,
    interests: &Matcher,
    mutes: &Matcher,
    weights: &Weights,
) -> rusqlite::Result<Vec<HomeItem>> {
    // Pull a wider pool than the band shows, newest first, then let the
    // scorer choose within it. Ranking the whole library on every open would
    // be the expensive way to get the same answer.
    let pool = (want * 12).clamp(40, 400) as i64;

    let sql = format!(
        "SELECT i.id, i.source_id, s.name, i.title, i.link, i.published,
                i.snippet, i.thumbnail, i.read, i.starred,
                (SELECT COUNT(*) FROM items d WHERE d.dedupe_hash = i.dedupe_hash) > 1
           FROM items i JOIN sources s ON s.id = i.source_id
          WHERE i.hidden = 0 AND i.published >= ?1 AND {}
          ORDER BY i.published DESC
          LIMIT ?2",
        match group_id {
            Some(_) => "s.group_id = ?3",
            None => "s.group_id IS NULL",
        }
    );

    let mut stmt = conn.prepare(&sql)?;
    let map = |r: &rusqlite::Row| -> rusqlite::Result<(HomeItem, bool)> {
        Ok((
            HomeItem {
                id: r.get(0)?,
                source_id: r.get(1)?,
                source_name: r.get(2)?,
                title: r.get(3)?,
                link: r.get(4)?,
                published: r.get(5)?,
                snippet: r.get(6)?,
                thumbnail: r.get(7)?,
                read: r.get::<_, i64>(8)? != 0,
                starred: r.get::<_, i64>(9)? != 0,
                why: String::new(),
            },
            r.get::<_, i64>(10)? != 0,
        ))
    };
    let rows: Vec<(HomeItem, bool)> = match group_id {
        Some(id) => stmt
            .query_map(params![since, pool, id], map)?
            .collect::<rusqlite::Result<_>>()?,
        None => stmt
            .query_map(params![since, pool], map)?
            .collect::<rusqlite::Result<_>>()?,
    };

    let mut scored: Vec<(f64, HomeItem)> = rows
        .into_iter()
        .map(|(mut item, is_duplicate)| {
            let c = Candidate {
                title: &item.title,
                snippet: &item.snippet,
                published: item.published,
                read: item.read,
                has_thumbnail: item.thumbnail.is_some(),
                is_duplicate,
                favourite: favourites.contains(&item.source_id),
                source_id: item.source_id,
            };
            let s = rank::score(&c, now, affinities, interests, mutes, weights);
            let why = rank::explain(&c, now, interests, mutes);
            item.why = why;
            (s, item)
        })
        .collect();

    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    scored.truncate(want);
    Ok(scored.into_iter().map(|(_, item)| item).collect())
}

/* -------------------------------- quotes -------------------------------- */

/// The lines that ship with the app. Editing the file is the feature, so this
/// is only what is there before anyone does.
const BUILT_IN: &[(&str, Option<&str>)] = &[
    ("The best time to plant a tree was twenty years ago. The second best time is now.", None),
    ("Simplicity is the soul of efficiency.", Some("Austin Freeman")),
    ("Make it work, make it right, make it fast.", Some("Kent Beck")),
    ("The only way to go fast is to go well.", Some("Robert C. Martin")),
    ("Reading furnishes the mind only with materials of knowledge; it is thinking that makes what we read ours.", Some("John Locke")),
    ("A person who never made a mistake never tried anything new.", Some("Albert Einstein")),
    ("Perfection is achieved when there is nothing left to take away.", Some("Antoine de Saint-Exupery")),
    ("It does not matter how slowly you go so long as you do not stop.", Some("Confucius")),
    ("What we know is a drop, what we do not know is an ocean.", Some("Isaac Newton")),
    ("The future depends on what you do today.", Some("Mahatma Gandhi")),
    ("Attention is the rarest and purest form of generosity.", Some("Simone Weil")),
    ("Beware of the person who gives advice about how to get rich.", None),
    ("You do not rise to the level of your goals, you fall to the level of your systems.", Some("James Clear")),
    ("The art of being wise is knowing what to overlook.", Some("William James")),
    ("Deep work is the ability to focus without distraction on a demanding task.", Some("Cal Newport")),
    ("Everything should be made as simple as possible, but no simpler.", Some("Albert Einstein")),
    ("Knowledge is a process of piling up facts; wisdom lies in their simplification.", Some("Martin Fischer")),
    ("If you are not willing to be bad at something, you will never be good at it.", None),
    ("Compound interest is the eighth wonder of the world.", None),
    ("Do not let what you cannot do interfere with what you can do.", Some("John Wooden")),
];

/// The quote for a given day. Keyed on the date so it does not reshuffle on
/// every render, which would make it decoration rather than something to read.
pub fn quote_for(day: i64, custom: &[Quote]) -> Option<Quote> {
    if !custom.is_empty() {
        let i = (day.rem_euclid(custom.len() as i64)) as usize;
        return custom.get(i).cloned();
    }
    let i = (day.rem_euclid(BUILT_IN.len() as i64)) as usize;
    BUILT_IN.get(i).map(|(text, author)| Quote {
        text: (*text).to_string(),
        author: author.map(str::to_string),
    })
}

/// Read the user's own quotes file, if they have made one. A bad file is
/// ignored rather than surfaced: the masthead is not the place to report a
/// JSON error.
pub fn custom_quotes(dir: &std::path::Path) -> Vec<Quote> {
    let path = dir.join("quotes.json");
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<Quote>>(&text).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOON: i64 = 1_800_000_000; // a Wednesday, mid-morning UTC

    #[test]
    fn today_starts_at_midnight_not_24_hours_ago() {
        let since = Window::Today.since(NOON);
        assert_eq!(since % 86_400, 0);
        assert!(since <= NOON);
        assert!(NOON - since < 86_400);
    }

    #[test]
    fn week_and_month_are_rolling() {
        assert_eq!(NOON - Window::Week.since(NOON), 7 * 86_400);
        assert_eq!(NOON - Window::Month.since(NOON), 30 * 86_400);
    }

    #[test]
    fn the_quote_is_stable_within_a_day_and_moves_between_days() {
        let a = quote_for(100, &[]).unwrap().text;
        assert_eq!(a, quote_for(100, &[]).unwrap().text);
        let b = quote_for(101, &[]).unwrap().text;
        assert_ne!(a, b);
    }

    #[test]
    fn a_custom_list_wins() {
        let mine = vec![Quote {
            text: "mine".into(),
            author: None,
        }];
        assert_eq!(quote_for(7, &mine).unwrap().text, "mine");
    }

    #[test]
    fn a_missing_quotes_file_is_not_an_error() {
        assert!(custom_quotes(std::path::Path::new("/nowhere/at/all")).is_empty());
    }

    #[test]
    fn layout_follows_what_the_feeds_actually_carry() {
        let with = |thumb: bool| HomeItem {
            id: 1,
            source_id: 1,
            source_name: String::new(),
            title: String::new(),
            link: None,
            published: 0,
            snippet: String::new(),
            thumbnail: thumb.then(|| "x".to_string()),
            read: false,
            starred: false,
            why: String::new(),
        };
        assert_eq!(
            default_layout(&[with(true), with(true), with(false)]),
            "cards"
        );
        assert_eq!(
            default_layout(&[with(false), with(false), with(true)]),
            "headlines"
        );
    }
}
