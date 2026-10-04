//! The Tauri command surface. Everything the UI can ask for.

use crate::{db, discover, feed, home, markdown, opml, readable, winstate};
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http: reqwest::Client,
    /// Held for the length of a refresh, so the background schedule and a
    /// manual refresh never fetch every feed twice at the same time.
    pub fetching: tokio::sync::Mutex<()>,
    /// Tray, notification and start-hidden preferences, kept in memory.
    pub background: crate::background::Live,
}

/// Tauri needs a `String` error; keep the real message.
fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[derive(Serialize)]
pub struct Group {
    pub id: i64,
    pub name: String,
    pub position: i64,
    pub expanded: bool,
    /// How the category is laid out on home, or None for automatic.
    pub home_layout: Option<String>,
}

#[derive(Serialize)]
pub struct Source {
    pub id: i64,
    pub url: String,
    pub name: String,
    pub site_url: Option<String>,
    pub icon_url: Option<String>,
    pub group_id: Option<i64>,
    pub unread: i64,
    pub last_fetched: Option<i64>,
    pub last_error: Option<String>,
    pub keep_limit: i64,
    pub pinned: bool,
}

#[derive(Serialize)]
pub struct ItemSummary {
    pub id: i64,
    pub source_id: i64,
    pub source_name: String,
    pub title: String,
    pub link: Option<String>,
    pub author: Option<String>,
    pub published: i64,
    pub snippet: String,
    pub thumbnail: Option<String>,
    pub read: bool,
    pub starred: bool,
}

#[derive(Serialize)]
pub struct ItemFull {
    pub id: i64,
    pub source_name: String,
    pub title: String,
    pub link: Option<String>,
    pub author: Option<String>,
    pub published: i64,
    /// already sanitised, see feed::sanitise
    pub content: String,
    pub read: bool,
    pub starred: bool,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    /// "all" | "source" | "group" | "starred"
    pub scope: Option<String>,
    pub id: Option<i64>,
    pub unread_only: Option<bool>,
    pub search: Option<String>,
    pub hide_duplicates: Option<bool>,
    /// "newest" | "oldest". Issues #246, #554
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// Unix seconds. Only used by `mark_all_read`, which marks items published
    /// at or before this instant. Fluent Reader offers the same 1/3/7 day cuts.
    pub before: Option<i64>,
}

#[derive(Serialize)]
pub struct FetchReport {
    pub sources: usize,
    pub new_items: usize,
    pub not_modified: usize,
    pub errors: Vec<(String, String)>,
    pub elapsed_ms: u128,
}

#[derive(Serialize)]
pub struct Stats {
    pub sources: i64,
    pub items: i64,
    pub unread: i64,
    pub starred: i64,
    pub db_bytes: i64,
}

/* ------------------------------- groups -------------------------------- */

#[tauri::command]
pub fn list_groups(state: State<AppState>) -> Result<Vec<Group>, String> {
    let conn = state.db.lock().map_err(e)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, name, position, expanded, home_layout FROM groups ORDER BY {}",
            order_by(&conn)
        ))
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Group {
                id: r.get(0)?,
                name: r.get(1)?,
                position: r.get(2)?,
                expanded: r.get::<_, i64>(3)? != 0,
                home_layout: r.get(4)?,
            })
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

#[tauri::command]
pub fn create_group(state: State<AppState>, name: String) -> Result<i64, String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "INSERT INTO groups(name, position) VALUES(?1, (SELECT COALESCE(MAX(position),0)+1 FROM groups))",
        params![name],
    )
    .map_err(e)?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn rename_group(state: State<AppState>, id: i64, name: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "UPDATE groups SET name = ?2 WHERE id = ?1",
        params![id, name],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_group(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])
        .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn set_group_expanded(state: State<AppState>, id: i64, expanded: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "UPDATE groups SET expanded = ?2 WHERE id = ?1",
        params![id, expanded as i64],
    )
    .map_err(e)?;
    Ok(())
}

/* ------------------------------- sources ------------------------------- */

/// Feeds and folders are hand-ordered by default and alphabetical on request.
/// Fluent Reader issue #539 asked for the second one.
fn order_by(conn: &Connection) -> &'static str {
    match db::get_setting_str(conn, "feed_sort").as_deref() {
        Some("alpha") => "name COLLATE NOCASE",
        _ => "position, name COLLATE NOCASE",
    }
}

#[tauri::command]
pub fn list_sources(state: State<AppState>) -> Result<Vec<Source>, String> {
    let conn = state.db.lock().map_err(e)?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT s.id, s.url, s.name, s.site_url, s.icon_url, s.group_id,
                        (SELECT COUNT(*) FROM items i
                          WHERE i.source_id = s.id AND i.read = 0 AND i.hidden = 0),
                        s.last_fetched, s.last_error, s.keep_limit, s.pinned
                   FROM sources s
                  WHERE s.hidden = 0
                  ORDER BY {}",
            order_by(&conn)
        ))
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Source {
                id: r.get(0)?,
                url: r.get(1)?,
                name: r.get(2)?,
                site_url: r.get(3)?,
                icon_url: r.get(4)?,
                group_id: r.get(5)?,
                unread: r.get(6)?,
                last_fetched: r.get(7)?,
                last_error: r.get(8)?,
                keep_limit: r.get(9)?,
                pinned: r.get::<_, i64>(10)? != 0,
            })
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

/// What the Add Feed dialog shows after Check: the feed found behind what was
/// typed, a few of its latest titles, and whether it is already subscribed.
#[tauri::command]
pub async fn preview_source(
    state: State<'_, AppState>,
    url: String,
) -> Result<discover::Preview, String> {
    let resolved = discover::resolve(&state.http, &url).await?;
    let existing = {
        let conn = state.db.lock().map_err(e)?;
        existing_source(&conn, &resolved.url)?
    };
    Ok(discover::preview(&resolved, existing))
}

/// Subscribe. Accepts a site address or a bare domain as readily as a feed
/// address, and refuses a feed that is already there rather than quietly
/// overwriting the name someone gave it.
#[tauri::command]
pub async fn add_source(
    state: State<'_, AppState>,
    url: String,
    group_id: Option<i64>,
) -> Result<i64, String> {
    let resolved = discover::resolve(&state.http, &url).await?;
    let conn = state.db.lock().map_err(e)?;
    if let Some(found) = existing_source(&conn, &resolved.url)? {
        return Err(format!("Already subscribed as \"{}\".", found.name));
    }
    let outcome = &resolved.outcome;
    let name = outcome
        .feed_title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| resolved.url.clone());
    conn.execute(
        "INSERT INTO sources(url, name, site_url, icon_url, group_id, position)
         VALUES(?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(position),0)+1 FROM sources))",
        params![
            resolved.url,
            name,
            outcome.site_url,
            outcome.icon_url,
            group_id
        ],
    )
    .map_err(e)?;
    let id = conn.last_insert_rowid();
    insert_entries(&conn, id, outcome).map_err(e)?;
    Ok(id)
}

/// The subscription for a feed address, if there is one. Compared without a
/// trailing slash, since the same feed is often written both ways.
fn existing_source(conn: &Connection, url: &str) -> Result<Option<discover::Existing>, String> {
    let bare = url.trim_end_matches('/');
    conn.query_row(
        "SELECT id, name FROM sources WHERE rtrim(url, '/') = ?1",
        params![bare],
        |r| {
            Ok(discover::Existing {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        },
    )
    .optional()
    .map_err(e)
}

#[tauri::command]
pub fn delete_source(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute("DELETE FROM sources WHERE id = ?1", params![id])
        .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn update_source(
    state: State<AppState>,
    id: i64,
    name: Option<String>,
    keep_limit: Option<i64>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    if let Some(n) = name {
        conn.execute("UPDATE sources SET name = ?2 WHERE id = ?1", params![id, n])
            .map_err(e)?;
    }
    if let Some(k) = keep_limit {
        conn.execute(
            "UPDATE sources SET keep_limit = ?2 WHERE id = ?1",
            params![id, k],
        )
        .map_err(e)?;
        db::enforce_keep_limit(&conn, id).map_err(e)?;
    }
    Ok(())
}

/// Put a feed in a folder, or take it out of one with `None`.
///
/// This used to be a field on update_source typed `Option<Option<i64>>`, which
/// cannot express "no folder" at all (a JSON null reads as "leave it alone")
/// and which the client was sending as an array the command could not read.
/// Moving a feed silently did nothing.
#[tauri::command]
pub fn move_source(state: State<AppState>, id: i64, group_id: Option<i64>) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    let n = conn
        .execute(
            "UPDATE sources SET group_id = ?2 WHERE id = ?1",
            params![id, group_id],
        )
        .map_err(e)?;
    if n == 0 {
        return Err("That feed no longer exists.".into());
    }
    Ok(())
}

/// How many articles a new retention limit would remove, so the confirmation
/// can say a number instead of "some". Starred articles are never counted,
/// because they are never removed.
#[tauri::command]
pub fn retention_preview(state: State<AppState>, id: i64, limit: i64) -> Result<i64, String> {
    if limit <= 0 {
        return Ok(0);
    }
    let conn = state.db.lock().map_err(e)?;
    conn.query_row(
        "SELECT COUNT(*) FROM items
          WHERE source_id = ?1 AND starred = 0
            AND id NOT IN (SELECT id FROM items WHERE source_id = ?1
                            ORDER BY published DESC LIMIT ?2)",
        params![id, limit],
        |r| r.get(0),
    )
    .map_err(e)
}

/// How many articles a mark-all-read would change, for its confirmation.
#[tauri::command]
pub fn mark_all_read_preview(state: State<AppState>, filter: Filter) -> Result<i64, String> {
    let conn = state.db.lock().map_err(e)?;
    let scope = filter.scope.as_deref().unwrap_or("all");
    let id = filter.id.unwrap_or(0);
    let before = filter.before.unwrap_or(i64::MAX);
    let n = match scope {
        "source" => conn.query_row(
            "SELECT COUNT(*) FROM items WHERE read = 0 AND hidden = 0 AND source_id = ?1 AND published <= ?2",
            params![id, before],
            |r| r.get(0),
        ),
        "group" => conn.query_row(
            "SELECT COUNT(*) FROM items WHERE read = 0 AND hidden = 0 AND published <= ?2 AND source_id IN
               (SELECT id FROM sources WHERE group_id = ?1)",
            params![id, before],
            |r| r.get(0),
        ),
        "starred" => conn.query_row(
            "SELECT COUNT(*) FROM items WHERE read = 0 AND hidden = 0 AND starred = 1 AND published <= ?1",
            params![before],
            |r| r.get(0),
        ),
        _ => conn.query_row(
            "SELECT COUNT(*) FROM items WHERE read = 0 AND hidden = 0 AND published <= ?1",
            params![before],
            |r| r.get(0),
        ),
    }
    .map_err(e)?;
    Ok(n)
}

/// Minutes between scheduled refreshes. 0 switches the schedule off.
pub fn refresh_minutes(conn: &Connection) -> i64 {
    db::get_setting_str(conn, "refresh_minutes")
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(30)
}

/// Whether the oldest feed is older than the interval. Measured from what is
/// in the database rather than from when the window opened, so reopening the
/// app does not trigger a refresh of feeds checked a minute ago, and a feed
/// that has never been fetched (just imported) is due at once.
pub fn refresh_due(conn: &Connection, now: i64) -> bool {
    let minutes = refresh_minutes(conn);
    if minutes <= 0 {
        return false;
    }
    let oldest: Option<i64> = conn
        .query_row(
            "SELECT MIN(COALESCE(last_fetched, 0)) FROM sources WHERE hidden = 0",
            [],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    match oldest {
        Some(t) => now - t >= minutes * 60,
        None => false,
    }
}

/* -------------------------------- fetch -------------------------------- */

fn insert_entries(
    conn: &Connection,
    source_id: i64,
    outcome: &feed::FetchOutcome,
) -> Result<usize> {
    let mut inserted = 0usize;
    let mut stmt = conn.prepare(
        "INSERT INTO items(source_id, guid, title, link, author, published, fetched,
                           content, snippet, thumbnail, dedupe_hash)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(source_id, guid) DO NOTHING",
    )?;
    let now = chrono::Utc::now().timestamp();
    for it in &outcome.entries {
        let n = stmt.execute(params![
            source_id,
            it.guid,
            it.title,
            it.link,
            it.author,
            it.published,
            now,
            it.content,
            it.snippet,
            it.thumbnail,
            it.dedupe_hash,
        ])?;
        inserted += n;
    }
    conn.execute(
        "UPDATE sources SET last_fetched = ?2, last_error = NULL, etag = ?3, last_modified = ?4,
                site_url = COALESCE(?5, site_url), icon_url = COALESCE(?6, icon_url)
          WHERE id = ?1",
        params![
            source_id,
            now,
            outcome.etag,
            outcome.last_modified,
            outcome.site_url,
            outcome.icon_url
        ],
    )?;
    db::enforce_keep_limit(conn, source_id)?;
    Ok(inserted)
}

#[tauri::command]
pub async fn fetch_all(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<FetchReport, String> {
    // A manual refresh waits for a scheduled one already in flight, then runs.
    let _guard = state.fetching.lock().await;
    run_refresh(&app, &state).await
}

/// One refresh with everything around it: tell the window it started and
/// finished, look up missing icons afterwards, and notify about new articles
/// if that is switched on. The caller holds `fetching`.
pub async fn run_refresh(app: &tauri::AppHandle, state: &AppState) -> Result<FetchReport, String> {
    let started = chrono::Utc::now().timestamp();
    let _ = tauri::Emitter::emit(app, "refresh-started", ());
    let report = refresh_all(state).await;
    if let Ok(r) = &report {
        let _ = tauri::Emitter::emit(app, "feeds-updated", r);
        spawn_icon_fill(app.clone());
        if r.new_items > 0 {
            crate::background::notify_new(app, started);
        }
    }
    report
}

/// "Refresh now" from the tray menu. Skipped if a refresh is already running.
pub async fn refresh_from_tray(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let Ok(_guard) = state.fetching.try_lock() else {
        return;
    };
    let _ = run_refresh(app, &state).await;
}

/// Fetch every feed. Shared by the refresh button and the background schedule.
pub async fn refresh_all(state: &AppState) -> Result<FetchReport, String> {
    let started = std::time::Instant::now();
    // Collect into an owned Vec and bind it, so the guard and the statement
    // are both released before the block ends. Nothing may be held across
    // the .await below.
    let targets: Vec<(i64, String, Option<String>, Option<String>)> = {
        let conn = state.db.lock().map_err(e)?;
        let mut stmt = conn
            .prepare("SELECT id, url, etag, last_modified FROM sources WHERE hidden = 0")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e)?;
        rows
    };

    let http = state.http.clone();
    // Bounded concurrency: polling 40 feeds at once is what makes this feel
    // instant, but unbounded would hammer the network and the connection pool.
    let results = futures_lite_join(targets, http).await;

    let mut report = FetchReport {
        sources: 0,
        new_items: 0,
        not_modified: 0,
        errors: vec![],
        elapsed_ms: 0,
    };
    // The guard lives in its own scope. A MutexGuard is not Send, so leaving it
    // alive across the favicon .await below would make the whole future !Send.
    {
        let conn = state.db.lock().map_err(e)?;
        // One transaction for the lot: a commit per article is most of the
        // cost of storing thousands of them.
        let tx = conn.unchecked_transaction().map_err(e)?;
        for (id, url, res) in results {
            report.sources += 1;
            match res {
                Ok(outcome) => {
                    if outcome.not_modified {
                        report.not_modified += 1;
                        // Unchanged is still checked. Skipping this left a feed
                        // that answers 304 looking permanently stale.
                        let _ = conn.execute(
                            "UPDATE sources SET last_fetched = ?2, last_error = NULL WHERE id = ?1",
                            params![id, chrono::Utc::now().timestamp()],
                        );
                        continue;
                    }
                    match insert_entries(&conn, id, &outcome) {
                        Ok(n) => report.new_items += n,
                        Err(err) => report.errors.push((url, err.to_string())),
                    }
                }
                Err(err) => {
                    let msg = err.to_string();
                    let _ = conn.execute(
                        "UPDATE sources SET last_error = ?2, last_fetched = ?3 WHERE id = ?1",
                        params![id, msg, chrono::Utc::now().timestamp()],
                    );
                    report.errors.push((url, msg));
                }
            }
        }
        tx.commit().map_err(e)?;
        // A big refresh leaves a big write-ahead log. Fold it into the
        // database now, while nothing else is writing, so it shrinks back.
        if report.new_items > 1000 {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }

    report.elapsed_ms = started.elapsed().as_millis();
    Ok(report)
}

/// Look up favicons for feeds that have never had one looked up. Runs after
/// the articles are stored and shown, because a site's icon lives at the site,
/// not in the feed, and a slow or missing icon must never hold up articles.
/// A lookup that finds nothing records an empty string, so it is not retried
/// on every refresh. Returns how many icons were found.
pub async fn fill_missing_icons(state: &AppState) -> usize {
    let needing: Vec<(i64, String)> = {
        let Ok(conn) = state.db.lock() else { return 0 };
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, COALESCE(site_url, url) FROM sources
              WHERE hidden = 0 AND icon_url IS NULL",
        ) else {
            return 0;
        };
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|it| it.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        rows
    };
    if needing.is_empty() {
        return 0;
    }
    let ids: Vec<i64> = needing.iter().map(|(id, _)| *id).collect();
    let icons = fetch_icons(needing, state.http.clone()).await;
    let Ok(conn) = state.db.lock() else { return 0 };
    let found = icons.len();
    for id in ids {
        let icon = icons
            .iter()
            .find(|(i, _)| *i == id)
            .map(|(_, icon)| icon.as_str())
            .unwrap_or("");
        let _ = conn.execute(
            "UPDATE sources SET icon_url = ?2 WHERE id = ?1 AND icon_url IS NULL",
            params![id, icon],
        );
    }
    found
}

/// Fill in icons in the background and tell the window when any arrive.
pub fn spawn_icon_fill(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        if fill_missing_icons(&state).await > 0 {
            let _ = tauri::Emitter::emit(&app, "icons-updated", ());
        }
    });
}

async fn fetch_icons(targets: Vec<(i64, String)>, http: reqwest::Client) -> Vec<(i64, String)> {
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    let sem = Arc::new(Semaphore::new(8));
    let mut handles = Vec::with_capacity(targets.len());
    for (id, site) in targets {
        let http = http.clone();
        let sem = sem.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await;
            feed::fetch_favicon(&http, &site)
                .await
                .ok()
                .map(|icon| (id, icon))
        }));
    }
    let mut out = Vec::new();
    for h in handles {
        if let Ok(Some(pair)) = h.await {
            out.push(pair);
        }
    }
    out
}

/// Fetch every target with a concurrency cap, preserving which source each
/// result belongs to.
async fn futures_lite_join(
    targets: Vec<(i64, String, Option<String>, Option<String>)>,
    http: reqwest::Client,
) -> Vec<(i64, String, Result<feed::FetchOutcome>)> {
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    let sem = Arc::new(Semaphore::new(12));
    let mut handles = Vec::with_capacity(targets.len());
    for (id, url, etag, lm) in targets {
        let http = http.clone();
        let sem = sem.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await;
            let res = feed::fetch(&http, &url, etag.as_deref(), lm.as_deref()).await;
            (id, url, res)
        }));
    }
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(v) => out.push(v),
            Err(join_err) => {
                out.push((-1, String::new(), Err(anyhow::anyhow!("task: {join_err}"))))
            }
        }
    }
    out
}

/* -------------------------------- items -------------------------------- */

#[tauri::command]
pub fn list_items(state: State<AppState>, filter: Filter) -> Result<Vec<ItemSummary>, String> {
    let conn = state.db.lock().map_err(e)?;
    let scope = filter.scope.as_deref().unwrap_or("all");
    let unread_only = filter.unread_only.unwrap_or(false);
    let hide_dupes = filter.hide_duplicates.unwrap_or(false);
    let desc = filter.sort.as_deref().unwrap_or("newest") != "oldest";
    let limit = filter.limit.unwrap_or(200).clamp(1, 1000);
    let offset = filter.offset.unwrap_or(0).max(0);

    let mut sql = String::from(
        "SELECT i.id, i.source_id, s.name, i.title, i.link, i.author, i.published,
                i.snippet, i.thumbnail, i.read, i.starred
           FROM items i JOIN sources s ON s.id = i.source_id
          WHERE i.hidden = 0",
    );
    match scope {
        "source" => sql.push_str(" AND i.source_id = :id"),
        "group" => sql.push_str(" AND s.group_id = :id"),
        "starred" => sql.push_str(" AND i.starred = 1"),
        _ => {}
    }
    if unread_only {
        sql.push_str(" AND i.read = 0");
    }
    if let Some(q) = filter.search.as_deref().filter(|q| !q.trim().is_empty()) {
        let _ = q;
        sql.push_str(" AND i.id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH :q)");
    }
    if hide_dupes {
        sql.push_str(" AND i.id IN (SELECT MIN(id) FROM items GROUP BY dedupe_hash)");
    }
    sql.push_str(if desc {
        " ORDER BY i.published DESC, i.id DESC"
    } else {
        " ORDER BY i.published ASC, i.id ASC"
    });
    sql.push_str(" LIMIT :limit OFFSET :offset");

    let mut stmt = conn.prepare(&sql).map_err(e)?;
    let mut named: Vec<(&str, &dyn rusqlite::ToSql)> = vec![
        (":limit", &limit as &dyn rusqlite::ToSql),
        (":offset", &offset as &dyn rusqlite::ToSql),
    ];
    let id_val = filter.id.unwrap_or(0);
    if matches!(scope, "source" | "group") {
        named.push((":id", &id_val));
    }
    let fts_query;
    if let Some(q) = filter.search.as_deref().filter(|q| !q.trim().is_empty()) {
        fts_query = fts_escape(q);
        named.push((":q", &fts_query));
    }

    let rows = stmt
        .query_map(named.as_slice(), |r| {
            Ok(ItemSummary {
                id: r.get(0)?,
                source_id: r.get(1)?,
                source_name: r.get(2)?,
                title: r.get(3)?,
                link: r.get(4)?,
                author: r.get(5)?,
                published: r.get(6)?,
                snippet: r.get(7)?,
                thumbnail: r.get(8)?,
                read: r.get::<_, i64>(9)? != 0,
                starred: r.get::<_, i64>(10)? != 0,
            })
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

/// Quote each term so user input can never be read as FTS5 syntax.
fn fts_escape(q: &str) -> String {
    q.split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn get_item(state: State<AppState>, id: i64) -> Result<ItemFull, String> {
    let conn = state.db.lock().map_err(e)?;
    let item = conn
        .query_row(
            "SELECT i.id, s.name, i.title, i.link, i.author, i.published, i.content, i.read, i.starred
               FROM items i JOIN sources s ON s.id = i.source_id
              WHERE i.id = ?1",
            params![id],
            |r| {
                Ok(ItemFull {
                    id: r.get(0)?,
                    source_name: r.get(1)?,
                    title: r.get(2)?,
                    link: r.get(3)?,
                    author: r.get(4)?,
                    published: r.get(5)?,
                    content: r.get(6)?,
                    read: r.get::<_, i64>(7)? != 0,
                    starred: r.get::<_, i64>(8)? != 0,
                })
            },
        )
        .map_err(e)?;
    Ok(item)
}

#[tauri::command]
pub fn set_read(state: State<AppState>, ids: Vec<i64>, read: bool) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(e)?;
    let tx = conn.transaction().map_err(e)?;
    {
        let mut stmt = tx
            .prepare("UPDATE items SET read = ?2 WHERE id = ?1")
            .map_err(e)?;
        for id in ids {
            stmt.execute(params![id, read as i64]).map_err(e)?;
        }
    }
    tx.commit().map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn set_starred(state: State<AppState>, id: i64, starred: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "UPDATE items SET starred = ?2 WHERE id = ?1",
        params![id, starred as i64],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn mark_all_read(state: State<AppState>, filter: Filter) -> Result<usize, String> {
    let conn = state.db.lock().map_err(e)?;
    let scope = filter.scope.as_deref().unwrap_or("all");
    let id = filter.id.unwrap_or(0);
    // i64::MAX stands in for "no cutoff" so every arm binds the same shape.
    let before = filter.before.unwrap_or(i64::MAX);
    let n = match scope {
        "source" => conn.execute(
            "UPDATE items SET read = 1
               WHERE read = 0 AND source_id = ?1 AND published <= ?2",
            params![id, before],
        ),
        "group" => conn.execute(
            "UPDATE items SET read = 1
               WHERE read = 0 AND published <= ?2 AND source_id IN
                 (SELECT id FROM sources WHERE group_id = ?1)",
            params![id, before],
        ),
        "starred" => conn.execute(
            "UPDATE items SET read = 1
               WHERE read = 0 AND starred = 1 AND published <= ?1",
            params![before],
        ),
        _ => conn.execute(
            "UPDATE items SET read = 1 WHERE read = 0 AND published <= ?1",
            params![before],
        ),
    }
    .map_err(e)?;
    Ok(n)
}

/* --------------------------------- opml -------------------------------- */

#[tauri::command]
pub async fn import_opml(state: State<'_, AppState>, xml: String) -> Result<usize, String> {
    let feeds = opml::parse(&xml).map_err(e)?;
    let mut added = 0usize;
    for f in feeds {
        let group_id = match &f.group {
            Some(g) => {
                let conn = state.db.lock().map_err(e)?;
                let existing: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM groups WHERE name = ?1 COLLATE NOCASE",
                        params![g],
                        |r| r.get(0),
                    )
                    .ok();
                match existing {
                    Some(id) => Some(id),
                    None => {
                        conn.execute(
                            "INSERT INTO groups(name, position) VALUES(?1,(SELECT COALESCE(MAX(position),0)+1 FROM groups))",
                            params![g],
                        )
                        .map_err(e)?;
                        Some(conn.last_insert_rowid())
                    }
                }
            }
            None => None,
        };
        // insert the row first so a feed that is temporarily unreachable is
        // still subscribed; the next fetch will fill it in
        {
            let conn = state.db.lock().map_err(e)?;
            let n = conn
                .execute(
                    "INSERT INTO sources(url, name, group_id, position)
                     VALUES(?1,?2,?3,(SELECT COALESCE(MAX(position),0)+1 FROM sources))
                     ON CONFLICT(url) DO NOTHING",
                    params![f.xml_url, f.title, group_id],
                )
                .map_err(e)?;
            added += n;
        }
    }
    Ok(added)
}

#[tauri::command]
pub fn export_opml(state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(e)?;
    let mut groups: Vec<(String, Vec<(String, String)>)> = Vec::new();
    {
        let mut gs = conn
            .prepare("SELECT id, name FROM groups ORDER BY position, name")
            .map_err(e)?;
        let list = gs
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(e)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(e)?;
        for (gid, gname) in list {
            let mut ss = conn
                .prepare(
                    "SELECT name, url FROM sources WHERE group_id = ?1 ORDER BY position, name",
                )
                .map_err(e)?;
            let feeds = ss
                .query_map(params![gid], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(e)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(e)?;
            groups.push((gname, feeds));
        }
    }
    let mut us = conn
        .prepare("SELECT name, url FROM sources WHERE group_id IS NULL ORDER BY position, name")
        .map_err(e)?;
    let ungrouped = us
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(opml::build(&groups, &ungrouped))
}

/* ------------------------------- settings ------------------------------ */

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(e)?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(e)?;
    let mut map = serde_json::Map::new();
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(e)?;
    for row in rows {
        let (k, v) = row.map_err(e)?;
        map.insert(
            k,
            serde_json::from_str(&v).unwrap_or(serde_json::Value::String(v)),
        );
    }
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
pub fn set_setting(
    state: State<AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    db::set_setting(&conn, &key, &value.to_string()).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn stats(state: State<AppState>) -> Result<Stats, String> {
    let conn = state.db.lock().map_err(e)?;
    let one =
        |sql: &str| -> Result<i64, String> { conn.query_row(sql, [], |r| r.get(0)).map_err(e) };
    let page_count = one("PRAGMA page_count")?;
    let page_size = one("PRAGMA page_size")?;
    Ok(Stats {
        // Hidden articles and feeds are left out, so these numbers agree with
        // what the sidebar shows rather than with what is on disk.
        sources: one("SELECT COUNT(*) FROM sources WHERE hidden = 0")?,
        items: one("SELECT COUNT(*) FROM items WHERE hidden = 0")?,
        unread: one("SELECT COUNT(*) FROM items WHERE read = 0 AND hidden = 0")?,
        starred: one("SELECT COUNT(*) FROM items WHERE starred = 1 AND hidden = 0")?,
        db_bytes: page_count * page_size,
    })
}

/* ------------------------------ plain files ----------------------------- */

/// Read a file the user picked in the open dialog. Doing this here instead of
/// through the fs plugin keeps the webview from holding any filesystem reach
/// of its own: the only paths it can name are ones a dialog handed it.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|err| format!("{path}: {err}"))
}

/// Write a file the user picked in the save dialog. Same reasoning.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|err| format!("{path}: {err}"))
}

/* ------------------------- article side actions ------------------------- */

/// Hide an article from every list without deleting it, the way Fluent
/// Reader's "Hide article" works. Dedupe still sees the row, so a hidden
/// story does not reappear through a second feed.
#[tauri::command]
pub fn set_hidden(state: State<AppState>, ids: Vec<i64>, hidden: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    for id in ids {
        conn.execute(
            "UPDATE items SET hidden = ?2, read = CASE WHEN ?2 = 1 THEN 1 ELSE read END
              WHERE id = ?1",
            params![id, i64::from(hidden)],
        )
        .map_err(e)?;
    }
    Ok(())
}

/// Fetch the article's own page and replace the stored body with the real
/// one. Feeds that publish a teaser are the reason this exists. The fetched
/// HTML goes through the same allowlist as feed content.
#[tauri::command]
pub async fn load_full_content(state: State<'_, AppState>, id: i64) -> Result<String, String> {
    let (link, current) = {
        let conn = state.db.lock().map_err(e)?;
        conn.query_row(
            "SELECT link, content FROM items WHERE id = ?1",
            params![id],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(e)?
    };
    let link = link.ok_or("This article has no link to load from.")?;

    match readable::fetch(&state.http, &link).await? {
        Some(body) if body.len() > current.len() => {
            let conn = state.db.lock().map_err(e)?;
            conn.execute(
                "UPDATE items SET content = ?2 WHERE id = ?1",
                params![id, &body],
            )
            .map_err(e)?;
            Ok(body)
        }
        _ => Err("Could not find a fuller article on that page.".into()),
    }
}

/// The article as a Markdown document, front matter and all.
#[tauri::command]
pub fn article_markdown(state: State<AppState>, id: i64) -> Result<MarkdownExport, String> {
    let conn = state.db.lock().map_err(e)?;
    let (source, title, link, author, published, content) = conn
        .query_row(
            "SELECT s.name, i.title, i.link, i.author, i.published, i.content
               FROM items i JOIN sources s ON s.id = i.source_id
              WHERE i.id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(e)?;

    let date = chrono::DateTime::from_timestamp(published, 0)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    Ok(MarkdownExport {
        filename: format!("{}.md", slug(&title)),
        markdown: markdown::document(
            &title,
            author.as_deref(),
            &source,
            link.as_deref(),
            &date,
            &content,
        ),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownExport {
    pub filename: String,
    pub markdown: String,
}

/// A QR code for the article link, as an inline SVG. Handy for carrying a
/// story to a phone, which is what Fluent Reader's reader menu uses it for.
#[tauri::command]
pub fn qr_svg(text: String) -> Result<String, String> {
    use qrcode::render::svg;
    use qrcode::{EcLevel, QrCode};

    let code = QrCode::with_error_correction_level(text.as_bytes(), EcLevel::M)
        .map_err(|err| err.to_string())?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(192, 192)
        .quiet_zone(true)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build())
}

/// A filesystem-safe stem for an article title.
fn slug(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut dash = false;
    for c in title.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let cut = trimmed
        .char_indices()
        .take_while(|(i, _)| *i < 60)
        .last()
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(0);
    let s = trimmed[..cut].trim_matches('-');
    if s.is_empty() {
        "article".into()
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod slug_tests {
    use super::slug;

    #[test]
    fn titles_become_safe_filenames() {
        assert_eq!(slug("Hello, World! / Part 2"), "hello-world-part-2");
        assert_eq!(slug("   "), "article");
        assert_eq!(slug("!!!"), "article");
        assert!(!slug(&"word ".repeat(40)).ends_with('-'));
    }
}

/* -------------------------------- updates ------------------------------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current: String,
    pub latest: Option<String>,
    pub newer: bool,
    pub url: String,
    pub published: Option<String>,
}

/// Ask GitHub what the newest published release is.
///
/// Deliberately not the Tauri updater: that wants a signing key pair and a
/// signed manifest, and until the binaries are code-signed it would be
/// ceremony around an unsigned download. This tells you a release exists and
/// sends you to the page; you decide.
#[tauri::command]
pub async fn check_for_updates(state: State<'_, AppState>) -> Result<UpdateCheck, String> {
    const RELEASES: &str = "https://github.com/t21dev/turbo-reader/releases/latest";
    let current = env!("CARGO_PKG_VERSION").to_string();

    let res = state
        .http
        .get("https://api.github.com/repos/t21dev/turbo-reader/releases/latest")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| format!("Could not reach GitHub: {err}"))?;

    if !res.status().is_success() {
        return Err(format!("GitHub returned {}", res.status()));
    }

    // reqwest is built without its json feature, so the body is parsed here.
    let text = res
        .text()
        .await
        .map_err(|err| format!("Unexpected answer from GitHub: {err}"))?;
    let body: serde_json::Value = serde_json::from_str(&text)
        .map_err(|err| format!("Unexpected answer from GitHub: {err}"))?;

    let latest = body
        .get("tag_name")
        .and_then(|v| v.as_str())
        .map(|t| t.trim_start_matches('v').to_string());
    let published = body
        .get("published_at")
        .and_then(|v| v.as_str())
        .map(|s| s[..10.min(s.len())].to_string());
    let url = body
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(RELEASES)
        .to_string();

    let newer = latest
        .as_deref()
        .map(|l| is_newer(l, &current))
        .unwrap_or(false);

    Ok(UpdateCheck {
        current,
        latest,
        newer,
        url,
        published,
    })
}

/// Compare two dotted versions numerically. A segment that is not a number
/// (`0.2.0-rc1`) compares on the numeric prefix, so a pre-release never reads
/// as newer than the release it precedes.
fn is_newer(candidate: &str, current: &str) -> bool {
    let part = |s: &str| -> Vec<u64> {
        s.split('.')
            .map(|seg| {
                seg.chars()
                    .take_while(char::is_ascii_digit)
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .collect()
    };
    let (a, b) = (part(candidate), part(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x > y;
        }
    }
    false
}

#[cfg(test)]
mod update_tests {
    use super::is_newer;

    #[test]
    fn newer_versions_win() {
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("0.1.10", "0.1.9"));
        assert!(is_newer("0.1.1", "0.1"));
    }

    #[test]
    fn same_or_older_does_not() {
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("0.1", "0.1.0"));
        // a pre-release is not newer than the release it leads to
        assert!(!is_newer("0.2.0-rc1", "0.2.0"));
    }

    #[test]
    fn junk_does_not_panic_or_win() {
        assert!(!is_newer("", "0.1.0"));
        assert!(!is_newer("vvv", "0.1.0"));
    }
}

/// Called by the frontend once the window is on screen. See
/// [`crate::winstate::settle`] for why the correction cannot happen earlier.
#[tauri::command]
pub fn settle_window(window: tauri::Window, state: State<AppState>) -> Result<(), String> {
    let want = {
        let conn = state.db.lock().map_err(e)?;
        winstate::load(&conn)
    };
    if let Some(want) = want {
        winstate::settle(&window, &want);
    }
    Ok(())
}

/* --------------------------------- home --------------------------------- */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeRequest {
    pub window: Option<home::Window>,
    pub per_band: Option<usize>,
    /// "off" | "quote" | "headline". Only "quote" costs anything here.
    pub masthead: Option<String>,
}

/// The whole home page in one call. Seven queries under one lock beats seven
/// IPC round trips, and a page that paints in pieces looks broken.
#[tauri::command]
pub fn home_summary(
    app: tauri::AppHandle,
    state: State<AppState>,
    req: HomeRequest,
) -> Result<home::Home, String> {
    let now = chrono::Utc::now().timestamp();
    let window = req.window.unwrap_or(home::Window::Today);
    let per_band = req.per_band.unwrap_or(8).clamp(1, 24);

    let conn = state.db.lock().map_err(e)?;
    let mut page = home::build(&conn, window, per_band, now).map_err(e)?;

    if req.masthead.as_deref() == Some("quote") {
        let custom = crate::data_dir(&app)
            .map(|dir| home::custom_quotes(&dir))
            .unwrap_or_default();
        page.quote = home::quote_for(now / 86_400, &custom);
    }
    Ok(page)
}

/// Pin or unpin a feed, which is what puts it in the home page's own row.
#[tauri::command]
pub fn set_pinned(state: State<AppState>, id: i64, pinned: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    let at = pinned.then(|| chrono::Utc::now().timestamp());
    conn.execute(
        "UPDATE sources SET pinned = ?2, pinned_at = ?3 WHERE id = ?1",
        params![id, i64::from(pinned), at],
    )
    .map_err(e)?;
    Ok(())
}

/// How one group's band is laid out. `None` goes back to deciding from
/// whether that group's feeds actually carry images.
#[tauri::command]
pub fn set_group_layout(
    state: State<AppState>,
    id: i64,
    layout: Option<String>,
) -> Result<(), String> {
    let layout = match layout.as_deref() {
        Some("cards") | Some("mosaic") | Some("magazine") | Some("compact") | Some("headlines") => {
            layout
        }
        Some(other) => return Err(format!("unknown layout: {other}")),
        None => None,
    };
    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "UPDATE groups SET home_layout = ?2 WHERE id = ?1",
        params![id, layout],
    )
    .map_err(e)?;
    Ok(())
}

/// Where the user's own quotes file lives, so Settings can point at it and
/// create it on first use.
#[tauri::command]
pub fn quotes_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = crate::data_dir(&app).map_err(e)?;
    Ok(dir.join("quotes.json").to_string_lossy().into_owned())
}

#[cfg(test)]
mod schedule_tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE sources (id INTEGER PRIMARY KEY, last_fetched INTEGER, hidden INTEGER NOT NULL DEFAULT 0);",
        )
        .unwrap();
        c
    }

    const NOW: i64 = 1_800_000_000;

    #[test]
    fn nothing_is_due_with_no_feeds() {
        assert!(!refresh_due(&conn(), NOW));
    }

    #[test]
    fn a_feed_checked_a_minute_ago_is_not_due() {
        let c = conn();
        c.execute("INSERT INTO sources(last_fetched) VALUES (?1)", [NOW - 60])
            .unwrap();
        assert!(!refresh_due(&c, NOW), "30 minute default");
    }

    #[test]
    fn the_oldest_feed_decides() {
        let c = conn();
        c.execute("INSERT INTO sources(last_fetched) VALUES (?1)", [NOW - 60])
            .unwrap();
        c.execute(
            "INSERT INTO sources(last_fetched) VALUES (?1)",
            [NOW - 31 * 60],
        )
        .unwrap();
        assert!(refresh_due(&c, NOW));
    }

    #[test]
    fn a_never_fetched_feed_is_due_at_once() {
        let c = conn();
        c.execute("INSERT INTO sources(last_fetched) VALUES (NULL)", [])
            .unwrap();
        assert!(refresh_due(&c, NOW));
    }

    #[test]
    fn the_interval_comes_from_settings_and_zero_switches_it_off() {
        let c = conn();
        c.execute(
            "INSERT INTO sources(last_fetched) VALUES (?1)",
            [NOW - 20 * 60],
        )
        .unwrap();
        db::set_setting(&c, "refresh_minutes", "15").unwrap();
        assert!(refresh_due(&c, NOW), "20 minutes old, 15 minute interval");
        db::set_setting(&c, "refresh_minutes", "0").unwrap();
        assert!(!refresh_due(&c, NOW), "off means off");
    }

    #[test]
    fn hidden_feeds_do_not_count() {
        let c = conn();
        c.execute(
            "INSERT INTO sources(last_fetched, hidden) VALUES (0, 1)",
            [],
        )
        .unwrap();
        c.execute("INSERT INTO sources(last_fetched) VALUES (?1)", [NOW - 60])
            .unwrap();
        assert!(!refresh_due(&c, NOW));
    }
}
