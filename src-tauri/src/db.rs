//! Storage. SQLite with FTS5 for search.
//!
//! Fluent Reader kept its whole article store in lovefield-on-IndexedDB, which
//! loads the entire database into the renderer's memory at startup. That is why
//! it slowed to a crawl past ~100 MB and why a single bad row could brick it.
//! Here the data stays in SQLite, queries are paged, and search goes through
//! FTS5 instead of scanning JavaScript objects.

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

pub const SCHEMA_VERSION: i32 = 3;

pub fn open(path: &Path) -> Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    // After a checkpoint the write-ahead log is cut back to this size. Without
    // a limit it stays as large as the biggest write it ever held: 95 MB after
    // importing 20,000 articles, sitting on disk next to a 92 MB database.
    conn.pragma_update(None, "journal_size_limit", 8 * 1024 * 1024)?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    let current: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if current >= SCHEMA_VERSION {
        return Ok(());
    }
    if current < 1 {
        conn.execute_batch(SCHEMA_V1)?;
    }
    if current < 2 {
        add_column(conn, "sources", "pinned", "INTEGER NOT NULL DEFAULT 0");
        add_column(conn, "sources", "pinned_at", "INTEGER");
        add_column(conn, "groups", "home_layout", "TEXT");
        conn.execute_batch(SCHEMA_V2)?;
    }
    if current < 3 {
        conn.execute_batch(SCHEMA_V3)?;
    }
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

const SCHEMA_V1: &str = r#"
BEGIN;

CREATE TABLE IF NOT EXISTS groups (
    id        INTEGER PRIMARY KEY,
    name      TEXT    NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    expanded  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sources (
    id             INTEGER PRIMARY KEY,
    url            TEXT    NOT NULL UNIQUE,
    name           TEXT    NOT NULL,
    site_url       TEXT,
    icon_url       TEXT,
    group_id       INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    -- per-source override in minutes; 0 means "use the global interval"
    fetch_interval INTEGER NOT NULL DEFAULT 0,
    last_fetched   INTEGER,
    last_error     TEXT,
    -- conditional GET, so a poll that changes nothing costs one 304
    etag           TEXT,
    last_modified  TEXT,
    -- cap retained items per source (0 = unlimited). Issue #334
    keep_limit     INTEGER NOT NULL DEFAULT 0,
    hidden         INTEGER NOT NULL DEFAULT 0,
    position       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
    id           INTEGER PRIMARY KEY,
    source_id    INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    -- identity is the feed's own guid where it gives one. Issue #256
    guid         TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    link         TEXT,
    author       TEXT,
    published    INTEGER NOT NULL,
    fetched      INTEGER NOT NULL,
    content      TEXT    NOT NULL,   -- sanitised in Rust before it ever lands here
    snippet      TEXT    NOT NULL,
    thumbnail    TEXT,
    -- hash of title+link, so the same story syndicated across feeds can be
    -- collapsed. Issues #144, #334, #533
    dedupe_hash  TEXT    NOT NULL,
    read         INTEGER NOT NULL DEFAULT 0,
    starred      INTEGER NOT NULL DEFAULT 0,
    hidden       INTEGER NOT NULL DEFAULT 0,
    UNIQUE(source_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_items_source    ON items(source_id);
CREATE INDEX IF NOT EXISTS idx_items_published ON items(published DESC);
CREATE INDEX IF NOT EXISTS idx_items_unread    ON items(read, published DESC);
CREATE INDEX IF NOT EXISTS idx_items_starred   ON items(starred) WHERE starred = 1;
CREATE INDEX IF NOT EXISTS idx_items_dedupe    ON items(dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_sources_group   ON sources(group_id);

-- Full-text search. External-content table so the index stays lean.
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    title, snippet, content, author,
    content='items', content_rowid='id',
    tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, title, snippet, content, author)
    VALUES (new.id, new.title, new.snippet, new.content, new.author);
END;

CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, snippet, content, author)
    VALUES ('delete', old.id, old.title, old.snippet, old.content, old.author);
END;

CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, title, snippet, content, author)
    VALUES ('delete', old.id, old.title, old.snippet, old.content, old.author);
    INSERT INTO items_fts(rowid, title, snippet, content, author)
    VALUES (new.id, new.title, new.snippet, new.content, new.author);
END;

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

COMMIT;
"#;

/// Home page support: pinned sources, a per-group layout, and an index that
/// serves the "since midnight" and "last 14 days" counts without a scan.
///
/// `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS`, so each one is run on
/// its own and a duplicate-column error is swallowed. That keeps the migration
/// safe to re-run against a database that a newer build already touched.
const SCHEMA_V2: &str = r#"
CREATE INDEX IF NOT EXISTS idx_items_pub_read ON items(published DESC, read);
CREATE INDEX IF NOT EXISTS idx_items_hidden   ON items(hidden, published DESC);
"#;

/// Per-feed unread counts. Without this index SQLite answered each feed's
/// count by walking idx_items_hidden over every article: 32 seconds for the
/// sidebar with 500 feeds and 20,000 articles, against a millisecond with it.
const SCHEMA_V3: &str = r#"
CREATE INDEX IF NOT EXISTS idx_items_source_state ON items(source_id, read, hidden);
"#;

fn add_column(conn: &Connection, table: &str, column: &str, decl: &str) {
    let _ = conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
        [],
    );
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

/// A setting saved through the set_setting command, as the plain string it
/// was before being stored.
///
/// set_setting stores JSON, so the word alpha is saved as "alpha" with its
/// quotes. Reading it raw and comparing against alpha never matched, which is
/// why alphabetical order and the home page's interest and mute lists did
/// nothing. A value that is not a JSON string is returned as it is.
pub fn get_setting_str(conn: &Connection, key: &str) -> Option<String> {
    let raw = get_setting(conn, key).ok().flatten()?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(serde_json::Value::String(s)) => Some(s),
        _ => Some(raw),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )?;
    Ok(())
}

/// Trim a source back to its retention limit, newest kept. Starred items are
/// never discarded.
pub fn enforce_keep_limit(conn: &Connection, source_id: i64) -> Result<usize> {
    let limit: i64 = conn.query_row(
        "SELECT keep_limit FROM sources WHERE id = ?1",
        [source_id],
        |r| r.get(0),
    )?;
    if limit <= 0 {
        return Ok(0);
    }
    let removed = conn.execute(
        "DELETE FROM items
          WHERE source_id = ?1
            AND starred = 0
            AND id NOT IN (
                SELECT id FROM items
                 WHERE source_id = ?1
                 ORDER BY published DESC
                 LIMIT ?2
            )",
        (source_id, limit),
    )?;
    Ok(removed)
}

#[cfg(test)]
mod setting_tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .unwrap();
        c
    }

    #[test]
    fn json_strings_come_back_plain() {
        let c = conn();
        set_setting(&c, "feed_sort", "\"alpha\"").unwrap();
        assert_eq!(get_setting_str(&c, "feed_sort").as_deref(), Some("alpha"));
    }

    #[test]
    fn newlines_inside_a_json_string_survive() {
        let c = conn();
        set_setting(&c, "home_interests", "\"rust\\nkubernetes\"").unwrap();
        assert_eq!(
            get_setting_str(&c, "home_interests").as_deref(),
            Some("rust\nkubernetes")
        );
    }

    #[test]
    fn values_that_are_not_json_strings_pass_through() {
        let c = conn();
        set_setting(&c, "raw", "plain").unwrap();
        assert_eq!(get_setting_str(&c, "raw").as_deref(), Some("plain"));
    }
}

#[cfg(test)]
mod index_tests {
    use super::*;

    /// The sidebar asks for every feed's unread count at once. That has to be
    /// an index lookup per feed, not a walk over every article per feed.
    #[test]
    fn per_feed_unread_counts_use_the_covering_index() {
        let c = Connection::open_in_memory().unwrap();
        migrate(&c).unwrap();
        let plan: Vec<String> = c
            .prepare(
                "EXPLAIN QUERY PLAN
                 SELECT s.id, (SELECT COUNT(*) FROM items i
                                WHERE i.source_id = s.id AND i.read = 0 AND i.hidden = 0)
                   FROM sources s WHERE s.hidden = 0",
            )
            .unwrap()
            .query_map([], |r| r.get::<_, String>(3))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(
            plan.iter().any(|l| l.contains("idx_items_source_state")),
            "plan was {plan:?}"
        );
    }
}
