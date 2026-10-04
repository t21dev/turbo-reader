//! The notification bell: a short history of what happened while you were not
//! looking (refreshes that found something, changes an AI agent made), plus
//! the feeds that need attention, which are read live from the feeds table.
//! Everything stays in the local database; nothing here touches the network.

use crate::commands::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Kept entries. Older ones are dropped as new ones arrive.
const KEEP: i64 = 200;
const PAGE: i64 = 20;
pub const CHANGED: &str = "notifications-changed";

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: i64,
    /// "refresh" or "agent".
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub source_id: Option<i64>,
    pub created: i64,
    pub seen: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub items: Vec<Notification>,
    pub has_more: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FailingFeed {
    pub id: i64,
    pub name: String,
    pub error: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub unseen: i64,
    pub failing: Vec<FailingFeed>,
    pub recent: Vec<Notification>,
}

pub(crate) fn add(
    conn: &Connection,
    kind: &str,
    title: &str,
    body: Option<&str>,
    source_id: Option<i64>,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO notifications(kind, title, body, source_id, created) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![kind, title, body, source_id, chrono::Utc::now().timestamp()],
    )?;
    let id = conn.last_insert_rowid();
    conn.execute(
        "DELETE FROM notifications WHERE id <= (SELECT id FROM notifications ORDER BY id DESC LIMIT 1 OFFSET ?1)",
        [KEEP],
    )?;
    Ok(id)
}

/// Record and tell the window, when there is one.
pub fn record(
    app: Option<&AppHandle>,
    conn: &Connection,
    kind: &str,
    title: &str,
    body: Option<&str>,
    source_id: Option<i64>,
) {
    if add(conn, kind, title, body, source_id).is_ok() {
        if let Some(app) = app {
            let _ = app.emit(CHANGED, ());
        }
    }
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Notification> {
    Ok(Notification {
        id: r.get(0)?,
        kind: r.get(1)?,
        title: r.get(2)?,
        body: r.get(3)?,
        source_id: r.get(4)?,
        created: r.get(5)?,
        seen: r.get::<_, i64>(6)? != 0,
    })
}

const COLS: &str = "id, kind, title, body, source_id, created, seen";

pub(crate) fn page(conn: &Connection, before: Option<i64>, limit: i64) -> rusqlite::Result<Page> {
    let limit = limit.clamp(1, 100);
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM notifications WHERE id < ?1 ORDER BY id DESC LIMIT ?2"
    ))?;
    let mut items = stmt
        .query_map(params![before.unwrap_or(i64::MAX), limit + 1], row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = items.len() as i64 > limit;
    items.truncate(limit as usize);
    Ok(Page { items, has_more })
}

pub(crate) fn summary(conn: &Connection) -> rusqlite::Result<Summary> {
    let unseen = conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE seen = 0",
        [],
        |r| r.get(0),
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, name, last_error FROM sources
          WHERE hidden = 0 AND last_error IS NOT NULL AND last_error != ''
          ORDER BY name COLLATE NOCASE",
    )?;
    let failing = stmt
        .query_map([], |r| {
            Ok(FailingFeed {
                id: r.get(0)?,
                name: r.get(1)?,
                error: r.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let recent = page(conn, None, 5)?.items;
    Ok(Summary {
        unseen,
        failing,
        recent,
    })
}

#[tauri::command]
pub fn notifications_summary(state: State<AppState>) -> Result<Summary, String> {
    let conn = state.db.lock().map_err(e)?;
    summary(&conn).map_err(e)
}

#[tauri::command]
pub fn notifications_page(
    state: State<AppState>,
    before: Option<i64>,
    limit: Option<i64>,
) -> Result<Page, String> {
    let conn = state.db.lock().map_err(e)?;
    page(&conn, before, limit.unwrap_or(PAGE)).map_err(e)
}

#[tauri::command]
pub fn notifications_mark_seen(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute("UPDATE notifications SET seen = 1 WHERE seen = 0", [])
        .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn notifications_clear(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute("DELETE FROM notifications", []).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn notifications_remove(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute("DELETE FROM notifications WHERE id = ?1", [id])
        .map_err(e)?;
    Ok(())
}

/// After a refresh that found new articles while nobody was looking at the
/// window: one entry naming the feeds, so a missed system notification (or
/// none at all) still leaves a trace.
pub fn record_refresh(app: &AppHandle, since: i64) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
            return;
        }
    }
    let state = app.state::<AppState>();
    let Ok(conn) = state.db.lock() else { return };
    let feeds = crate::background::new_by_feed(&conn, since, false);
    let total: i64 = feeds.iter().map(|(_, n)| n).sum();
    if total == 0 {
        return;
    }
    let mut body = feeds
        .iter()
        .take(4)
        .map(|(name, n)| format!("{name} {n}"))
        .collect::<Vec<_>>()
        .join(", ");
    if feeds.len() > 4 {
        body.push_str(&format!(" and {} more", feeds.len() - 4));
    }
    let title = format!(
        "{total} new article{} while you were away",
        if total == 1 { "" } else { "s" }
    );
    let only = if feeds.len() == 1 {
        conn.query_row(
            "SELECT id FROM sources WHERE name = ?1",
            [&feeds[0].0],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
    } else {
        None
    };
    record(Some(app), &conn, "refresh", &title, Some(&body), only);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate_for_tests(&c);
        c
    }

    #[test]
    fn pages_newest_first_and_keeps_the_last_200() {
        let c = conn();
        for i in 0..230 {
            add(&c, "agent", &format!("n{i}"), None, None).unwrap();
        }
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM notifications", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, KEEP);
        let first = page(&c, None, 20).unwrap();
        assert_eq!(first.items[0].title, "n229");
        assert!(first.has_more);
        let next = page(&c, Some(first.items.last().unwrap().id), 20).unwrap();
        assert_eq!(next.items[0].title, "n209");
        // a page is capped at 100, whatever is asked for
        let big = page(&c, Some(next.items.last().unwrap().id), 500).unwrap();
        assert_eq!(big.items.len(), 100);
        assert!(big.has_more);
        let last = page(&c, Some(big.items.last().unwrap().id), 100).unwrap();
        assert_eq!(last.items.len(), 60);
        assert!(!last.has_more);
    }

    #[test]
    fn summary_counts_unseen_and_lists_failing_feeds() {
        let c = conn();
        c.execute_batch(
            "INSERT INTO sources(id, url, name, last_error) VALUES (1, 'a', 'Broken', 'HTTP 404'), (2, 'b', 'Fine', NULL);",
        )
        .unwrap();
        add(&c, "refresh", "3 new", Some("Fine 3"), Some(2)).unwrap();
        let s = summary(&c).unwrap();
        assert_eq!(s.unseen, 1);
        assert_eq!(s.failing.len(), 1);
        assert_eq!(s.failing[0].name, "Broken");
        c.execute("UPDATE notifications SET seen = 1", []).unwrap();
        assert_eq!(summary(&c).unwrap().unseen, 0);
    }
}
