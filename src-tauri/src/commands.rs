//! The Tauri command surface. Everything the UI can ask for.

use crate::{db, feed, opml};
use anyhow::Result;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http: reqwest::Client,
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
    /// already sanitised — see feed::sanitise
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
    /// "newest" | "oldest" — issues #246, #554
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
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
        .prepare("SELECT id, name, position, expanded FROM groups ORDER BY position, name")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Group {
                id: r.get(0)?,
                name: r.get(1)?,
                position: r.get(2)?,
                expanded: r.get::<_, i64>(3)? != 0,
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
    conn.execute("UPDATE groups SET name = ?2 WHERE id = ?1", params![id, name])
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

#[tauri::command]
pub fn list_sources(state: State<AppState>) -> Result<Vec<Source>, String> {
    let conn = state.db.lock().map_err(e)?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.url, s.name, s.site_url, s.icon_url, s.group_id,
                    (SELECT COUNT(*) FROM items i WHERE i.source_id = s.id AND i.read = 0 AND i.hidden = 0),
                    s.last_fetched, s.last_error, s.keep_limit
               FROM sources s
              WHERE s.hidden = 0
              ORDER BY s.position, s.name COLLATE NOCASE",
        )
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
            })
        })
        .map_err(e)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(e)?;
    Ok(rows)
}

#[tauri::command]
pub async fn add_source(
    state: State<'_, AppState>,
    url: String,
    group_id: Option<i64>,
) -> Result<i64, String> {
    let http = state.http.clone();
    let outcome = feed::fetch(&http, &url, None, None).await.map_err(e)?;
    let name = outcome
        .feed_title
        .clone()
        .unwrap_or_else(|| url.clone());

    let conn = state.db.lock().map_err(e)?;
    conn.execute(
        "INSERT INTO sources(url, name, site_url, icon_url, group_id, position)
         VALUES(?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(position),0)+1 FROM sources))
         ON CONFLICT(url) DO UPDATE SET name = excluded.name",
        params![url, name, outcome.site_url, outcome.icon_url, group_id],
    )
    .map_err(e)?;
    let id: i64 = conn
        .query_row("SELECT id FROM sources WHERE url = ?1", params![url], |r| r.get(0))
        .map_err(e)?;
    insert_entries(&conn, id, &outcome).map_err(e)?;
    Ok(id)
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
    group_id: Option<Option<i64>>,
    keep_limit: Option<i64>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    if let Some(n) = name {
        conn.execute("UPDATE sources SET name = ?2 WHERE id = ?1", params![id, n])
            .map_err(e)?;
    }
    if let Some(g) = group_id {
        conn.execute("UPDATE sources SET group_id = ?2 WHERE id = ?1", params![id, g])
            .map_err(e)?;
    }
    if let Some(k) = keep_limit {
        conn.execute("UPDATE sources SET keep_limit = ?2 WHERE id = ?1", params![id, k])
            .map_err(e)?;
        db::enforce_keep_limit(&conn, id).map_err(e)?;
    }
    Ok(())
}

/* -------------------------------- fetch -------------------------------- */

fn insert_entries(conn: &Connection, source_id: i64, outcome: &feed::FetchOutcome) -> Result<usize> {
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
pub async fn fetch_all(state: State<'_, AppState>) -> Result<FetchReport, String> {
    let started = std::time::Instant::now();
    // Collect into an owned Vec and bind it, so the guard and the statement
    // are both released before the block ends — nothing may be held across
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
    let conn = state.db.lock().map_err(e)?;
    for (id, url, res) in results {
        report.sources += 1;
        match res {
            Ok(outcome) => {
                if outcome.not_modified {
                    report.not_modified += 1;
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
    report.elapsed_ms = started.elapsed().as_millis();
    Ok(report)
}

/// Fetch every target with a concurrency cap, preserving which source each
/// result belongs to.
async fn futures_lite_join(
    targets: Vec<(i64, String, Option<String>, Option<String>)>,
    http: reqwest::Client,
) -> Vec<(i64, String, Result<feed::FetchOutcome>)> {
    use tokio::sync::Semaphore;
    use std::sync::Arc;

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
    let n = match scope {
        "source" => conn.execute(
            "UPDATE items SET read = 1 WHERE read = 0 AND source_id = ?1",
            params![id],
        ),
        "group" => conn.execute(
            "UPDATE items SET read = 1 WHERE read = 0 AND source_id IN
               (SELECT id FROM sources WHERE group_id = ?1)",
            params![id],
        ),
        _ => conn.execute("UPDATE items SET read = 1 WHERE read = 0", []),
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
                .prepare("SELECT name, url FROM sources WHERE group_id = ?1 ORDER BY position, name")
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
        map.insert(k, serde_json::from_str(&v).unwrap_or(serde_json::Value::String(v)));
    }
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: serde_json::Value) -> Result<(), String> {
    let conn = state.db.lock().map_err(e)?;
    db::set_setting(&conn, &key, &value.to_string()).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn stats(state: State<AppState>) -> Result<Stats, String> {
    let conn = state.db.lock().map_err(e)?;
    let one = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0)).map_err(e)
    };
    let page_count = one("PRAGMA page_count")?;
    let page_size = one("PRAGMA page_size")?;
    Ok(Stats {
        sources: one("SELECT COUNT(*) FROM sources")?,
        items: one("SELECT COUNT(*) FROM items")?,
        unread: one("SELECT COUNT(*) FROM items WHERE read = 0")?,
        starred: one("SELECT COUNT(*) FROM items WHERE starred = 1")?,
        db_bytes: page_count * page_size,
    })
}
