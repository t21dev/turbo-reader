//! Running in the background: the tray icon, keeping the app alive when the
//! window closes, starting hidden at login, and notifying about new articles.
//!
//! All of it is off by default and costs nothing while off: the tray icon only
//! exists while "keep running in the tray" is on, and no notification code
//! runs unless notifications are switched on.

use crate::commands::AppState;
use crate::db;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};

const TRAY_ID: &str = "turbo-reader";
const KEY_TRAY: &str = "bg_close_to_tray";
const KEY_NOTIFY: &str = "bg_notify";
/// Passed by the autostart entry, so a launch at login starts in the tray.
pub const HIDDEN_ARG: &str = "--hidden";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Notify {
    #[default]
    Off,
    All,
    Pinned,
}

impl Notify {
    fn as_u8(self) -> u8 {
        match self {
            Notify::Off => 0,
            Notify::All => 1,
            Notify::Pinned => 2,
        }
    }
    fn from_u8(n: u8) -> Self {
        match n {
            1 => Notify::All,
            2 => Notify::Pinned,
            _ => Notify::Off,
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "all" => Notify::All,
            "pinned" => Notify::Pinned,
            _ => Notify::Off,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    /// Closing the window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    /// System notifications when a background refresh brings new articles.
    pub notify: Notify,
}

/// The live copy of the preferences, read on every window close and refresh
/// without touching the database.
#[derive(Default)]
pub struct Live {
    close_to_tray: AtomicBool,
    notify: AtomicU8,
    /// Whether this launch started in the tray (from login).
    started_hidden: AtomicBool,
}

impl Live {
    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::Relaxed)
    }
    pub fn notify(&self) -> Notify {
        Notify::from_u8(self.notify.load(Ordering::Relaxed))
    }
    fn set(&self, prefs: Prefs) {
        self.close_to_tray
            .store(prefs.close_to_tray, Ordering::Relaxed);
        self.notify.store(prefs.notify.as_u8(), Ordering::Relaxed);
    }
}

pub fn load(conn: &Connection) -> Prefs {
    Prefs {
        close_to_tray: db::get_setting_str(conn, KEY_TRAY).as_deref() == Some("true"),
        notify: Notify::parse(
            db::get_setting_str(conn, KEY_NOTIFY)
                .as_deref()
                .unwrap_or("off"),
        ),
    }
}

/// At startup: apply the saved preferences, and decide whether this launch
/// stays in the tray. Only a launch from login with the tray switched on does;
/// otherwise there would be no way back to the window.
pub fn init(app: &AppHandle, conn: &Connection) {
    let prefs = load(conn);
    let state = app.state::<AppState>();
    state.background.set(prefs);
    if prefs.close_to_tray {
        let _ = show_tray(app);
        let hidden = std::env::args().any(|a| a == HIDDEN_ARG);
        state
            .background
            .started_hidden
            .store(hidden, Ordering::Relaxed);
    }
}

/// Show the main window and bring it forward.
pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_tray(app: &AppHandle) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Open Turbo Reader", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Turbo Reader", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &refresh, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Turbo Reader")
        .menu(&menu)
        // Left click opens the window; the menu is on right click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_window(app),
            "refresh" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::refresh_from_tray(&app).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn hide_tray(app: &AppHandle) {
    let _ = app.remove_tray_by_id(TRAY_ID);
}

/* ------------------------------- commands ------------------------------- */

#[tauri::command]
pub fn get_background(state: State<AppState>) -> Prefs {
    Prefs {
        close_to_tray: state.background.close_to_tray(),
        notify: state.background.notify(),
    }
}

/// Save the background preferences and apply them at once: the tray icon
/// appears or goes away without a restart.
#[tauri::command]
pub fn set_background(
    app: AppHandle,
    state: State<AppState>,
    prefs: Prefs,
) -> Result<Prefs, String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let notify = match prefs.notify {
            Notify::Off => "off",
            Notify::All => "all",
            Notify::Pinned => "pinned",
        };
        db::set_setting(&conn, KEY_TRAY, &format!("\"{}\"", prefs.close_to_tray))
            .map_err(|e| e.to_string())?;
        db::set_setting(&conn, KEY_NOTIFY, &format!("\"{notify}\"")).map_err(|e| e.to_string())?;
    }
    state.background.set(prefs);
    if prefs.close_to_tray {
        show_tray(&app).map_err(|e| e.to_string())?;
    } else {
        hide_tray(&app);
    }
    Ok(prefs)
}

/// Whether the window should stay hidden on this launch (started at login with
/// the tray on). The page asks before showing itself.
#[tauri::command]
pub fn start_hidden(state: State<AppState>) -> bool {
    state.background.started_hidden.load(Ordering::Relaxed)
}

/* ---------------------------- notifications ----------------------------- */

/// After a background refresh: one notification naming the feeds with new
/// articles, if notifications are on and the window is out of sight. `since`
/// is when the refresh started, so only articles it stored are counted.
pub fn notify_new(app: &AppHandle, since: i64) {
    let state = app.state::<AppState>();
    let mode = state.background.notify();
    if mode == Notify::Off {
        return;
    }
    // Someone looking at the window sees the articles arrive; no need.
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            return;
        }
    }
    let feeds = {
        let Ok(conn) = state.db.lock() else { return };
        new_by_feed(&conn, since, mode == Notify::Pinned)
    };
    let total: i64 = feeds.iter().map(|(_, n)| n).sum();
    if total == 0 {
        return;
    }
    let mut body = feeds
        .iter()
        .take(3)
        .map(|(name, n)| format!("{name} ({n})"))
        .collect::<Vec<_>>()
        .join(", ");
    if feeds.len() > 3 {
        body.push_str(&format!(" and {} more feeds", feeds.len() - 3));
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(format!(
            "{total} new article{}",
            if total == 1 { "" } else { "s" }
        ))
        .body(body)
        .show();
}

/// New articles per feed since a moment, most first.
pub(crate) fn new_by_feed(conn: &Connection, since: i64, pinned_only: bool) -> Vec<(String, i64)> {
    let sql = format!(
        "SELECT s.name, COUNT(*) FROM items i JOIN sources s ON s.id = i.source_id
          WHERE i.fetched >= ?1 AND i.hidden = 0 AND s.hidden = 0 {}
          GROUP BY s.id ORDER BY 2 DESC, s.name",
        if pinned_only { "AND s.pinned = 1" } else { "" }
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return Vec::new();
    };
    stmt.query_map([since], |r| Ok((r.get(0)?, r.get(1)?)))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE sources (id INTEGER PRIMARY KEY, name TEXT, hidden INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0);
             CREATE TABLE items (id INTEGER PRIMARY KEY, source_id INTEGER, fetched INTEGER, hidden INTEGER DEFAULT 0);",
        )
        .unwrap();
        c
    }

    #[test]
    fn everything_is_off_until_switched_on() {
        let c = conn();
        let p = load(&c);
        assert!(!p.close_to_tray);
        assert_eq!(p.notify, Notify::Off);
    }

    #[test]
    fn saved_preferences_load_back() {
        let c = conn();
        db::set_setting(&c, KEY_TRAY, "\"true\"").unwrap();
        db::set_setting(&c, KEY_NOTIFY, "\"pinned\"").unwrap();
        let p = load(&c);
        assert!(p.close_to_tray);
        assert_eq!(p.notify, Notify::Pinned);
    }

    #[test]
    fn new_articles_are_counted_per_feed_and_pinned_only_filters() {
        let c = conn();
        c.execute_batch(
            "INSERT INTO sources(id, name, pinned) VALUES (1, 'Ars', 1), (2, 'xkcd', 0);
             INSERT INTO items(source_id, fetched) VALUES (1, 100), (1, 100), (2, 100), (2, 50);",
        )
        .unwrap();
        assert_eq!(
            new_by_feed(&c, 100, false),
            vec![("Ars".to_string(), 2), ("xkcd".to_string(), 1)]
        );
        assert_eq!(new_by_feed(&c, 100, true), vec![("Ars".to_string(), 2)]);
    }
}
