//! Turbo Reader, a fast and modern RSS reader.
//!
//! Feed fetching, parsing and HTML sanitising all happen here in Rust, off the
//! UI thread. The webview only ever receives content that has been through the
//! allowlist in `feed::sanitise`, which is what makes a malformed article
//! unable to take the window down with it.

mod commands;
mod db;
mod discover;
mod feed;
mod home;
mod markdown;
mod opml;
mod rank;
mod readable;
mod winstate;

use commands::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, WindowEvent};

/// How long to wait after the last move or resize before writing the state.
/// Long enough that dragging the window is one write, short enough that a
/// crash a second later still loses nothing.
const WINDOW_STATE_DEBOUNCE: Duration = Duration::from_millis(600);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("turbo-reader.db"))?;

            // Put the window back before it is shown. It is created hidden and
            // revealed from the frontend once React has painted, so none of
            // this is visible as a jump.
            winstate::restore(app.handle(), &conn);

            let http = feed::client()?;
            app.manage(AppState {
                db: Mutex::new(conn),
                http,
                fetching: tokio::sync::Mutex::new(()),
            });
            spawn_refresh_schedule(app.handle().clone());
            Ok(())
        })
        // Saving only on a clean exit is not enough: a crash, a kill or a power
        // cut would all lose where the window was.
        .on_window_event({
            // When a save is due, and whether a thread is already waiting for
            // it. One thread services any number of events.
            let due: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
            let waiting = Arc::new(AtomicBool::new(false));

            move |window, event| {
                match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {}
                    // Closing saves at once, so a position held for less than
                    // the debounce still survives quitting.
                    WindowEvent::CloseRequested { .. } => {
                        save_now(window);
                        return;
                    }
                    _ => return,
                }

                {
                    let Ok(mut slot) = due.lock() else { return };
                    *slot = Some(Instant::now() + WINDOW_STATE_DEBOUNCE);
                }
                // A drag fires hundreds of these. Only the first starts a thread.
                if waiting.swap(true, Ordering::SeqCst) {
                    return;
                }

                let window = window.clone();
                let due = Arc::clone(&due);
                let waiting = Arc::clone(&waiting);
                std::thread::spawn(move || {
                    loop {
                        let remaining = {
                            let Ok(slot) = due.lock() else { break };
                            match *slot {
                                Some(at) => at.saturating_duration_since(Instant::now()),
                                None => break,
                            }
                        };
                        if !remaining.is_zero() {
                            std::thread::sleep(remaining);
                            continue;
                        }
                        if let Ok(mut slot) = due.lock() {
                            *slot = None;
                        }
                        save_now(&window);
                        break;
                    }
                    waiting.store(false, Ordering::SeqCst);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_groups,
            commands::create_group,
            commands::rename_group,
            commands::delete_group,
            commands::set_group_expanded,
            commands::list_sources,
            commands::add_source,
            commands::delete_source,
            commands::update_source,
            commands::fetch_all,
            commands::list_items,
            commands::get_item,
            commands::set_read,
            commands::set_starred,
            commands::mark_all_read,
            commands::import_opml,
            commands::export_opml,
            commands::get_settings,
            commands::set_setting,
            commands::stats,
            commands::set_hidden,
            commands::load_full_content,
            commands::article_markdown,
            commands::qr_svg,
            commands::check_for_updates,
            commands::home_summary,
            commands::set_pinned,
            commands::set_group_layout,
            commands::quotes_path,
            commands::preview_source,
            commands::move_source,
            commands::retention_preview,
            commands::mark_all_read_preview,
            commands::settle_window,
            commands::read_text_file,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Turbo Reader");
}

/// How often the schedule looks at the clock. Cheap: one query, no network.
const SCHEDULE_TICK: Duration = Duration::from_secs(30);

/// Refresh on a schedule, from Rust rather than a timer in the page.
///
/// A webview timer is throttled when the window is minimised or covered, is
/// torn down and recreated whenever the page's state changes, and starts from
/// nothing on every launch. This keeps time against the database, so it
/// survives restarts, runs while the window is out of sight, and tells the
/// window when there is something new to show.
fn spawn_refresh_schedule(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(SCHEDULE_TICK).await;
            let state = app.state::<AppState>();
            let due = {
                let Ok(conn) = state.db.lock() else { continue };
                commands::refresh_due(&conn, chrono::Utc::now().timestamp())
            };
            if !due {
                continue;
            }
            // Skip this tick if a manual refresh is already running.
            let Ok(_guard) = state.fetching.try_lock() else {
                continue;
            };
            let _ = tauri::Emitter::emit(&app, "refresh-started", ());
            if let Ok(report) = commands::refresh_all(&state).await {
                let _ = tauri::Emitter::emit(&app, "feeds-updated", &report);
                commands::spawn_icon_fill(app.clone());
            }
        }
    });
}

/// Write the window's geometry, if there is a sensible one to write and the
/// database is free. Never blocks the window event it was called from.
fn save_now<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let Some(state) = winstate::capture(window) else {
        return;
    };
    let Some(app_state) = window.app_handle().try_state::<AppState>() else {
        return;
    };
    let Ok(conn) = app_state.db.try_lock() else {
        return;
    };
    winstate::store(&conn, &state);
}
