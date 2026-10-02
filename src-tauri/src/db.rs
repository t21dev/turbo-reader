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

pub const SCHEMA_VERSION: i32 = 2;

pub fn open(path: &Path) -> Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
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
