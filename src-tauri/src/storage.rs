//! Settings > Storage: how much room the library and the webview take, and
//! the ways to give some of it back. Nothing here runs unless asked.

use crate::commands::AppState;
use crate::db;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

const WEBVIEW_CLEAR_PENDING: &str = "storage_webview_clear_pending";

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    /// The database file with its write-ahead log.
    pub db_bytes: u64,
    /// Space inside the database that compacting would hand back.
    pub reclaimable_bytes: u64,
    pub articles: i64,
    /// Articles whose full text was downloaded and can be dropped again.
    pub full_count: i64,
    pub full_bytes: i64,
    /// Images, scripts and shader caches the webview keeps.
    pub webview_bytes: u64,
    /// The webview cache is cleared the next time the app starts.
    pub webview_pending: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OldRead {
    pub count: i64,
    pub bytes: i64,
}

fn file_len(p: &Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

fn dir_size(p: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(p) else {
        return 0;
    };
    entries
        .flatten()
        .map(|en| match en.file_type() {
            Ok(t) if t.is_dir() => dir_size(&en.path()),
            Ok(_) => en.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::data_dir(app).map_err(e)?.join("turbo-reader.db"))
}

fn db_bytes(path: &Path) -> u64 {
    let wal = PathBuf::from(format!("{}-wal", path.display()));
    file_len(path) + file_len(&wal)
}

/// The webview's cache folders. Only caches: local storage, which holds the
/// theme and layout, is left alone.
fn webview_cache_dirs(app: &AppHandle) -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        let base = match crate::portable_data_dir() {
            Some(dir) => dir.join("webview").join("EBWebView"),
            None => match app.path().app_local_data_dir() {
                Ok(d) => d.join("EBWebView"),
                Err(_) => return Vec::new(),
            },
        };
        let profile = base.join("Default");
        let mut dirs: Vec<PathBuf> = [
            "Cache",
            "Code Cache",
            "GPUCache",
            "DawnGraphiteCache",
            "DawnWebGPUCache",
        ]
        .iter()
        .map(|d| profile.join(d))
        .collect();
        dirs.extend(
            ["GrShaderCache", "ShaderCache", "GPUPersistentCache"]
                .iter()
                .map(|d| base.join(d)),
        );
        dirs
    }
    #[cfg(not(windows))]
    {
        // WebKit keeps its network and code caches under the user cache
        // folder, named after the app; the data it must keep lives elsewhere.
        let identifier = app.config().identifier.clone();
        let Some(cache) = dirs::cache_dir() else {
            return Vec::new();
        };
        #[allow(unused_mut)]
        let mut dirs = vec![cache.join(&identifier)];
        #[cfg(target_os = "linux")]
        dirs.push(cache.join("turbo-reader"));
        dirs
    }
}

fn info(app: &AppHandle, conn: &Connection) -> Result<StorageInfo, String> {
    let page: i64 = conn
        .pragma_query_value(None, "page_size", |r| r.get(0))
        .map_err(e)?;
    let free: i64 = conn
        .pragma_query_value(None, "freelist_count", |r| r.get(0))
        .map_err(e)?;
    let (articles, full_count, full_bytes): (i64, i64, i64) = conn
        .query_row(
            "SELECT COUNT(*),
                    COUNT(feed_content),
                    COALESCE(SUM(CASE WHEN feed_content IS NOT NULL
                                      THEN MAX(LENGTH(content) - LENGTH(feed_content), 0) END), 0)
               FROM items",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(e)?;
    Ok(StorageInfo {
        db_bytes: db_bytes(&db_path(app)?),
        reclaimable_bytes: (page * free).max(0) as u64,
        articles,
        full_count,
        full_bytes,
        webview_bytes: webview_cache_dirs(app).iter().map(|d| dir_size(d)).sum(),
        webview_pending: db::get_setting_str(conn, WEBVIEW_CLEAR_PENDING).as_deref() == Some("1"),
    })
}

#[tauri::command]
pub fn storage_info(app: AppHandle, state: State<AppState>) -> Result<StorageInfo, String> {
    let conn = state.db.lock().map_err(e)?;
    info(&app, &conn)
}

/// Fold the write-ahead log back in, tidy the search index and rebuild the
/// file without its empty pages. Nothing is deleted.
pub(crate) fn compact(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA wal_checkpoint(TRUNCATE);
         INSERT INTO items_fts(items_fts) VALUES('optimize');
         VACUUM;
         PRAGMA wal_checkpoint(TRUNCATE);",
    )
}

#[tauri::command]
pub async fn storage_compact(app: AppHandle) -> Result<StorageInfo, String> {
    // VACUUM takes a moment on a large library; keep it off the async workers.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(e)?;
        compact(&conn).map_err(e)?;
        info(&app, &conn)
    })
    .await
    .map_err(e)?
}

/// Put the feed's own text back wherever a full article was downloaded.
pub(crate) fn clear_full(conn: &Connection) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE items SET content = feed_content, feed_content = NULL
          WHERE feed_content IS NOT NULL",
        [],
    )
}

#[tauri::command]
pub fn storage_clear_full(state: State<AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(e)?;
    clear_full(&conn).map_err(e)
}

const OLD_READ: &str = "read = 1 AND starred = 0 AND published < ?1";

fn cutoff(days: i64) -> i64 {
    chrono::Utc::now().timestamp() - days.max(1) * 86_400
}

pub(crate) fn old_read_at(conn: &Connection, before: i64) -> rusqlite::Result<OldRead> {
    conn.query_row(
        &format!(
            "SELECT COUNT(*),
                    COALESCE(SUM(LENGTH(content) + LENGTH(snippet) + LENGTH(title)
                                 + COALESCE(LENGTH(feed_content), 0)), 0)
               FROM items WHERE {OLD_READ}"
        ),
        [before],
        |r| {
            Ok(OldRead {
                count: r.get(0)?,
                bytes: r.get(1)?,
            })
        },
    )
}

/// Delete read, unstarred articles published before `before`, and remember
/// the date per feed so the next refresh does not bring them back as new.
pub(crate) fn delete_old_read_at(conn: &Connection, before: i64) -> rusqlite::Result<usize> {
    let tx = conn.unchecked_transaction()?;
    let removed = tx.execute(&format!("DELETE FROM items WHERE {OLD_READ}"), [before])?;
    tx.execute(
        "UPDATE sources SET pruned_before = MAX(COALESCE(pruned_before, 0), ?1)",
        params![before],
    )?;
    tx.commit()?;
    Ok(removed)
}

#[tauri::command]
pub fn storage_old_read(state: State<AppState>, days: i64) -> Result<OldRead, String> {
    let conn = state.db.lock().map_err(e)?;
    old_read_at(&conn, cutoff(days)).map_err(e)
}

#[tauri::command]
pub fn storage_delete_old_read(state: State<AppState>, days: i64) -> Result<usize, String> {
    let conn = state.db.lock().map_err(e)?;
    delete_old_read_at(&conn, cutoff(days)).map_err(e)
}

/// The webview holds its cache open while it runs, so clearing it is booked
/// for the next start, before the window exists.
#[tauri::command]
pub fn storage_clear_webview(state: State<AppState>, clear: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    db::set_setting(&conn, WEBVIEW_CLEAR_PENDING, if clear { "1" } else { "0" }).map_err(e)
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

/// At startup, before the window is built: clear the webview cache if that
/// was asked for. A restart can race the old webview's exit, so a locked
/// folder gets a few short retries, and stays booked if it is still locked.
pub fn clear_webview_if_pending(app: &AppHandle, conn: &Connection) {
    if db::get_setting_str(conn, WEBVIEW_CLEAR_PENDING).as_deref() != Some("1") {
        return;
    }
    let mut left = webview_cache_dirs(app);
    for _ in 0..10 {
        left.retain(|d| d.exists() && std::fs::remove_dir_all(d).is_err());
        if left.is_empty() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    if left.is_empty() {
        let _ = db::set_setting(conn, WEBVIEW_CLEAR_PENDING, "0");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        db::migrate_for_tests(&c);
        c.execute_batch(
            "INSERT INTO sources(id, url, name) VALUES (1, 'u', 'Feed');
             INSERT INTO items(id, source_id, guid, title, published, fetched, content, snippet,
                               dedupe_hash, read, starred, feed_content)
             VALUES (1, 1, 'a', 'Old read',    100, 0, 'full text here', 's', 'h1', 1, 0, 'short'),
                    (2, 1, 'b', 'Old starred', 100, 0, 'x', 's', 'h2', 1, 1, NULL),
                    (3, 1, 'c', 'Old unread',  100, 0, 'x', 's', 'h3', 0, 0, NULL),
                    (4, 1, 'd', 'New read',    900, 0, 'x', 's', 'h4', 1, 0, NULL);",
        )
        .unwrap();
        c
    }

    fn pruned(c: &Connection) -> i64 {
        c.query_row("SELECT pruned_before FROM sources WHERE id = 1", [], |r| {
            r.get(0)
        })
        .unwrap()
    }

    #[test]
    fn old_read_keeps_starred_unread_and_recent() {
        let c = conn();
        assert_eq!(old_read_at(&c, 500).unwrap().count, 1);
        assert_eq!(delete_old_read_at(&c, 500).unwrap(), 1);
        let left: Vec<i64> = c
            .prepare("SELECT id FROM items ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(left, vec![2, 3, 4]);
        assert_eq!(pruned(&c), 500);
        // a smaller clean-up later never moves the date back
        delete_old_read_at(&c, 200).unwrap();
        assert_eq!(pruned(&c), 500);
    }

    #[test]
    fn clearing_full_text_restores_the_feed_version() {
        let c = conn();
        assert_eq!(clear_full(&c).unwrap(), 1);
        let (content, kept): (String, Option<String>) = c
            .query_row(
                "SELECT content, feed_content FROM items WHERE id = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(content, "short");
        assert_eq!(kept, None);
        // search sees the restored text, not the dropped one
        let hits = |q: &str| -> i64 {
            c.query_row(
                "SELECT COUNT(*) FROM items_fts WHERE items_fts MATCH ?1",
                [q],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(hits("short"), 1);
        assert_eq!(hits("here"), 0);
    }

    #[test]
    fn compact_runs_on_a_live_library() {
        let c = conn();
        c.execute("DELETE FROM items WHERE id = 4", []).unwrap();
        compact(&c).unwrap();
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
    }
}
