//! Remembering where the window was.
//!
//! This is hand-rolled rather than `tauri-plugin-window-state` because two
//! things on Windows make the obvious version wrong, and both were observed
//! rather than guessed:
//!
//! 1. An undecorated window still carries the style bits of a decorated one,
//!    so asking for an inner height of 775 can produce something else. The
//!    frame of a title bar that is never drawn is still in the arithmetic.
//! 2. Converting through logical pixels on a fractional scale factor (1.5 on
//!    the machine this was found on) rounds, and the rounding lands the same
//!    way every launch. The window shrank 43px per restart, which compounds.
//!
//! So: physical pixels throughout, read and written through the same API, and
//! a correction pass that measures what actually arrived rather than trusting
//! any frame constant. The correction runs after the window is on screen,
//! because a window that has never been shown reports sizes that were never
//! laid out.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{Manager, PhysicalPosition, PhysicalSize};

use crate::db;

/// The window's real client size, straight from the OS.
///
/// Tauri's `inner_size()` cannot be used for this. On an undecorated window it
/// reported 689 where `GetClientRect` said 603, and it lagged a launch behind,
/// so a correction pass built on it saw no error while the window shrank 43px
/// every time the app opened.
#[cfg(windows)]
fn client_size<R: tauri::Runtime>(window: &tauri::Window<R>) -> Option<(u32, u32)> {
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetClientRect;

    let hwnd = window.hwnd().ok()?.0 as HWND;
    let mut r = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    // SAFETY: hwnd comes from Tauri and is valid for as long as the window is,
    // and GetClientRect only writes into the rect we own.
    let ok = unsafe { GetClientRect(hwnd, &mut r) };
    (ok != 0).then(|| {
        (
            (r.right - r.left).max(0) as u32,
            (r.bottom - r.top).max(0) as u32,
        )
    })
}

#[cfg(not(windows))]
fn client_size<R: tauri::Runtime>(window: &tauri::Window<R>) -> Option<(u32, u32)> {
    let s = window.inner_size().ok()?;
    Some((s.width, s.height))
}

const KEY: &str = "window_state";

/// Physical pixels, exactly as the platform reports them. No scale factor is
/// applied anywhere: this is only ever fed back to windows on the same
/// machine, and every conversion is a chance to round.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

pub fn load(conn: &Connection) -> Option<WindowState> {
    let raw = db::get_setting(conn, KEY).ok().flatten()?;
    let state: WindowState = serde_json::from_str(&raw).ok()?;
    // A size too small to use is treated as no state at all, so one bad write
    // can never leave the window permanently unopenable.
    (state.width >= 200 && state.height >= 150).then_some(state)
}

pub fn store(conn: &Connection, state: &WindowState) {
    if let Ok(json) = serde_json::to_string(state) {
        let _ = db::set_setting(conn, KEY, &json);
    }
}

/// Read the window's current geometry, or `None` when there is nothing worth
/// saving. A minimized window reports an off-screen position, so it saves
/// nothing. A maximized one reports the screen rather than the size to restore
/// to, so it keeps the last normal geometry (`previous`) and only sets the
/// flag: un-maximizing next time goes back to where the window was.
pub fn capture<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    previous: Option<WindowState>,
) -> Option<WindowState> {
    if window.is_minimized().unwrap_or(false) {
        return None;
    }
    if window.is_maximized().unwrap_or(false) {
        return Some(match previous {
            Some(p) => WindowState {
                maximized: true,
                ..p
            },
            // Never saved in its normal state: keep the screen it is on.
            None => {
                let pos = window.outer_position().ok()?;
                let (width, height) = client_size(window)?;
                WindowState {
                    x: pos.x,
                    y: pos.y,
                    width,
                    height,
                    maximized: true,
                }
            }
        });
    }
    let pos = window.outer_position().ok()?;
    let (width, height) = client_size(window)?;
    (width >= 200 && height >= 150).then_some(WindowState {
        x: pos.x,
        y: pos.y,
        width,
        height,
        maximized: false,
    })
}

/// Put the window back where it was, before it is shown. Maximizing waits for
/// the reveal (`reveal_window`): on Windows it also shows the window, which
/// here would show it before there is anything painted in it.
pub fn apply<R: tauri::Runtime>(window: &tauri::Window<R>, state: &WindowState) {
    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
}

/// Correct the size once the window is visible.
///
/// Ask for a size, measure what arrived, then ask again for the difference.
/// Nothing here knows how thick any platform's frame is, which is the point: a
/// hard-coded offset would be wrong on the next Windows build, on a different
/// scale factor, or on another platform entirely.
pub fn settle<R: tauri::Runtime>(window: &tauri::Window<R>, want: &WindowState) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    // Three passes, because the first correction is itself subject to the same
    // frame arithmetic. In practice it lands on the second.
    let mut request = (want.width as i64, want.height as i64);
    for pass in 0..3 {
        let measured = client_size(window);
        trace(&format!(
            "settle {pass}: measured={measured:?} want={want:?}"
        ));
        let Some((w, h)) = measured else {
            return;
        };
        let dw = w as i64 - want.width as i64;
        let dh = h as i64 - want.height as i64;
        if dw == 0 && dh == 0 {
            return;
        }
        request = (
            (request.0 - dw).clamp(200, 20_000),
            (request.1 - dh).clamp(200, 20_000),
        );
        trace(&format!(
            "settle {pass}: dw={dw} dh={dh} request={request:?}"
        ));
        let _ = window.set_size(PhysicalSize::new(request.0 as u32, request.1 as u32));
    }
}

/// Append one line to the trace log, when tracing is on.
fn trace(line: &str) {
    if std::env::var_os("TURBO_WINSTATE_TRACE").is_none() {
        return;
    }
    let Ok(dir) = std::env::var("APPDATA") else {
        return;
    };
    let path = std::path::Path::new(&dir)
        .join("dev.t21.turbo-reader")
        .join("winstate-trace.log");
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "{line}");
    }
}

/// Restore at startup, if anything was stored.
pub fn restore<R: tauri::Runtime>(app: &tauri::AppHandle<R>, conn: &Connection) {
    let Some(state) = load(conn) else { return };
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if is_off_screen(&window, &state) {
        return;
    }
    let window = window.as_ref().window();
    apply(&window, &state);
}

/// A window saved on a monitor that is no longer attached would open where
/// nobody can reach it, so fall back to the configured default. The test is on
/// the title bar strip, because that is the part which has to be grabbable.
fn is_off_screen<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, state: &WindowState) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    if monitors.is_empty() {
        return false;
    }
    const MARGIN: i32 = 48;
    monitors.iter().all(|m| {
        let pos = m.position();
        let size = m.size();
        let right = pos.x + size.width as i32;
        let bottom = pos.y + size.height as i32;
        let strip_right = state.x + state.width as i32;
        state.x > right - MARGIN
            || strip_right < pos.x + MARGIN
            || state.y > bottom - 24
            || state.y + MARGIN < pos.y
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .unwrap();
        c
    }

    const SOME: WindowState = WindowState {
        x: 404,
        y: 212,
        width: 1200,
        height: 775,
        maximized: false,
    };

    #[test]
    fn state_round_trips_through_settings() {
        let c = conn();
        store(&c, &SOME);
        assert_eq!(load(&c), Some(SOME));
    }

    #[test]
    fn nothing_stored_means_nothing_restored() {
        assert_eq!(load(&conn()), None);
    }

    #[test]
    fn junk_in_the_row_does_not_panic() {
        let c = conn();
        db::set_setting(&c, KEY, "not json at all").unwrap();
        assert_eq!(load(&c), None);
    }

    #[test]
    fn absurd_sizes_are_rejected() {
        let c = conn();
        store(
            &c,
            &WindowState {
                width: 4,
                height: 4,
                ..SOME
            },
        );
        assert_eq!(load(&c), None);
    }
}
