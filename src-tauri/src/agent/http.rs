//! The MCP server over HTTP, inside the app, and everything it needs: API
//! keys, the key check, the activity log, and starting and stopping.
//!
//! It is off by default. Nothing listens until it is switched on in Settings,
//! and switching it off closes the port again.

use super::server::{Caller, TurboTools};
use crate::commands::AppState;
use crate::db;
use axum::extract::{Request, State as AxState};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use tokio_util::sync::CancellationToken;

pub const DEFAULT_PORT: u16 = 7811;
const KEY_ENABLED: &str = "mcp_enabled";
const KEY_PORT: &str = "mcp_port";
const KEY_LAN: &str = "mcp_lan";
const LOG_SIZE: usize = 50;

/* ------------------------------- activity ------------------------------- */

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub at: i64,
    pub key: String,
    pub tool: String,
}

/// The running server, if any, and the recent calls. Lives in AppState.
#[derive(Default)]
pub struct McpControl {
    running: Mutex<Option<Running>>,
    log: Mutex<VecDeque<Activity>>,
}

struct Running {
    cancel: CancellationToken,
    addr: SocketAddr,
}

impl McpControl {
    pub fn record(&self, key: &str, tool: &str) {
        if let Ok(mut log) = self.log.lock() {
            if log.len() == LOG_SIZE {
                log.pop_back();
            }
            log.push_front(Activity {
                at: chrono::Utc::now().timestamp(),
                key: key.to_string(),
                tool: tool.to_string(),
            });
        }
    }
    fn addr(&self) -> Option<SocketAddr> {
        self.running.lock().ok()?.as_ref().map(|r| r.addr)
    }
    fn stop(&self) {
        if let Ok(mut r) = self.running.lock() {
            if let Some(run) = r.take() {
                run.cancel.cancel();
            }
        }
    }
}

/* ------------------------------- settings ------------------------------- */

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub enabled: bool,
    pub port: u16,
    /// Listen on every network interface instead of this computer only.
    pub lan: bool,
}

fn load(conn: &Connection) -> Config {
    let get = |k| db::get_setting_str(conn, k);
    Config {
        enabled: get(KEY_ENABLED).as_deref() == Some("true"),
        port: get(KEY_PORT)
            .and_then(|p| p.parse().ok())
            .unwrap_or(DEFAULT_PORT),
        lan: get(KEY_LAN).as_deref() == Some("true"),
    }
}

fn save(conn: &Connection, c: Config) -> Result<(), String> {
    let put =
        |k, v: String| db::set_setting(conn, k, &format!("\"{v}\"")).map_err(|e| e.to_string());
    put(KEY_ENABLED, c.enabled.to_string())?;
    put(KEY_PORT, c.port.to_string())?;
    put(KEY_LAN, c.lan.to_string())
}

/* --------------------------------- keys --------------------------------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub id: i64,
    pub name: String,
    /// The first characters, so a key can be recognised without being shown.
    pub prefix: String,
    pub write: bool,
    pub created: i64,
    pub last_used: Option<i64>,
}

fn hash(key: &str) -> String {
    Sha256::digest(key.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn new_key() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(format!(
        "trk_{}",
        bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
    ))
}

/// The caller for a presented key, if it is one of ours.
fn check_key(conn: &Connection, presented: &str) -> Option<Caller> {
    let (id, name, write, last): (i64, String, bool, Option<i64>) = conn
        .query_row(
            "SELECT id, name, can_write, last_used FROM api_keys WHERE hash = ?1",
            [hash(presented.trim())],
            |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0, r.get(3)?)),
        )
        .ok()?;
    // Note use at most once a minute, so a busy agent is not a stream of writes.
    let now = chrono::Utc::now().timestamp();
    if last.map(|l| now - l >= 60).unwrap_or(true) {
        let _ = conn.execute(
            "UPDATE api_keys SET last_used = ?1 WHERE id = ?2",
            [now, id],
        );
    }
    Some(Caller {
        key_name: name,
        write,
    })
}

/// The key from `Authorization: Bearer`, `Authorization: Basic` (the key as
/// the password, any username) or `X-API-Key`.
fn presented_key(req: &Request) -> Option<String> {
    let h = req.headers();
    if let Some(v) = h.get("x-api-key").and_then(|v| v.to_str().ok()) {
        return Some(v.to_string());
    }
    let auth = h.get(header::AUTHORIZATION)?.to_str().ok()?;
    if let Some(token) = auth
        .strip_prefix("Bearer ")
        .or_else(|| auth.strip_prefix("bearer "))
    {
        return Some(token.to_string());
    }
    let basic = auth
        .strip_prefix("Basic ")
        .or_else(|| auth.strip_prefix("basic "))?;
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(basic.trim())
        .ok()?;
    let text = String::from_utf8(decoded).ok()?;
    Some(
        text.split_once(':')
            .map(|(_, p)| p)
            .unwrap_or(&text)
            .to_string(),
    )
}

/// Agents (Claude Code, Codex, Cursor) send no Origin header; web pages do.
/// A page on some other site must never reach this server, even with a key
/// pasted into it, so any Origin that is not this computer is refused. This
/// is the DNS-rebinding defence the MCP specification asks for.
fn origin_allowed(req: &Request) -> bool {
    let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    else {
        return true;
    };
    url::Url::parse(origin)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .map(|h| matches!(h.as_str(), "localhost" | "127.0.0.1" | "[::1]"))
        .unwrap_or(false)
}

async fn require_key(
    AxState(state): AxState<&'static AppState>,
    mut req: Request,
    next: Next,
) -> Response {
    if !origin_allowed(&req) {
        return (
            StatusCode::FORBIDDEN,
            "Turbo Reader does not accept requests from web pages. Connect from an AI agent or another local program.",
        )
            .into_response();
    }
    let caller =
        presented_key(&req).and_then(|k| state.db.lock().ok().and_then(|c| check_key(&c, &k)));
    match caller {
        Some(caller) => {
            req.extensions_mut().insert(caller);
            next.run(req).await
        }
        None => (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Bearer realm=\"Turbo Reader\"")],
            "Turbo Reader needs an API key: send it as Authorization: Bearer <key>. Create one in Settings > AI agents.",
        )
            .into_response(),
    }
}

/* ------------------------------ start / stop ---------------------------- */

/// Start the server with this configuration, stopping any that runs.
async fn start(app: &AppHandle, config: Config) -> Result<SocketAddr, String> {
    let state: &'static AppState = static_state(app);
    state.mcp.stop();
    let ip = if config.lan {
        [0, 0, 0, 0]
    } else {
        [127, 0, 0, 1]
    };
    let listener = tokio::net::TcpListener::bind(SocketAddr::from((ip, config.port)))
        .await
        .map_err(|e| {
            format!(
                "Could not listen on port {}: {e}. Pick another port.",
                config.port
            )
        })?;
    let addr = listener.local_addr().map_err(|e| e.to_string())?;

    let cancel = CancellationToken::new();
    let app_for_tools = app.clone();
    let mut http_config = StreamableHttpServerConfig::default();
    http_config.cancellation_token = cancel.child_token();
    // Requests from other machines carry this machine's address as Host, so
    // the loopback-only Host check is lifted only when the network is allowed.
    if config.lan {
        http_config.allowed_hosts = Vec::new();
    }
    let service = StreamableHttpService::new(
        move || Ok(TurboTools::new(state, Some(app_for_tools.clone()), false)),
        Arc::new(LocalSessionManager::default()),
        http_config,
    );
    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(state, require_key));

    let stop = cancel.clone();
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move { stop.cancelled().await })
            .await;
    });
    if let Ok(mut r) = state.mcp.running.lock() {
        *r = Some(Running { cancel, addr });
    }
    Ok(addr)
}

/// AppState lives as long as the app; the server needs a 'static reference.
/// Made once, however often the server is restarted.
fn static_state(app: &AppHandle) -> &'static AppState {
    static HANDLE: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();
    HANDLE
        .get_or_init(|| app.clone())
        .state::<AppState>()
        .inner()
}

/// At launch: start the server if it was left switched on.
pub fn init(app: &AppHandle, conn: &Connection) {
    let config = load(conn);
    if config.enabled {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = start(&app, config).await;
        });
    }
}

/* ------------------------------- commands ------------------------------- */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub config: Config,
    /// The address actually listening, when running.
    pub listening: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn mcp_status(state: State<AppState>) -> Result<Status, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(Status {
        config: load(&conn),
        listening: state.mcp.addr().map(|a| a.to_string()),
        error: None,
    })
}

/// Save the configuration and apply it: start, restart on a new port or
/// interface, or stop.
#[tauri::command]
pub async fn mcp_configure(
    app: AppHandle,
    state: State<'_, AppState>,
    config: Config,
) -> Result<Status, String> {
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        save(&conn, config)?;
    }
    let error = if config.enabled {
        start(&app, config).await.err()
    } else {
        state.mcp.stop();
        None
    };
    Ok(Status {
        config,
        listening: state.mcp.addr().map(|a| a.to_string()),
        error,
    })
}

#[tauri::command]
pub fn mcp_keys(state: State<AppState>) -> Result<Vec<KeyInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut st = conn
        .prepare("SELECT id, name, prefix, can_write, created, last_used FROM api_keys ORDER BY created DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| {
            Ok(KeyInfo {
                id: r.get(0)?,
                name: r.get(1)?,
                prefix: r.get(2)?,
                write: r.get::<_, i64>(3)? != 0,
                created: r.get(4)?,
                last_used: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Create a key. The key itself is returned once, here, and never stored.
#[tauri::command]
pub fn mcp_create_key(state: State<AppState>, name: String, write: bool) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Give the key a name, such as the agent or machine it is for.".into());
    }
    let key = new_key()?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO api_keys(name, prefix, hash, can_write, created) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            name,
            &key[..12],
            hash(&key),
            write as i64,
            chrono::Utc::now().timestamp()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(key)
}

#[tauri::command]
pub fn mcp_revoke_key(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM api_keys WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mcp_activity(state: State<AppState>) -> Vec<Activity> {
    state
        .mcp
        .log
        .lock()
        .map(|l| l.iter().cloned().collect())
        .unwrap_or_default()
}

/// Where this program lives, for the stdio setup that agents start themselves.
#[tauri::command]
pub fn mcp_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// This computer's addresses on the local network, so Settings can show the
/// URL another machine would use.
#[tauri::command]
pub fn mcp_lan_addresses() -> Vec<String> {
    // Connecting a UDP socket sends nothing; it only picks the outgoing interface.
    std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("192.0.2.1:9")?;
            s.local_addr()
        })
        .map(|a| vec![a.ip().to_string()])
        .unwrap_or_default()
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
    fn keys_are_stored_hashed_and_checked() {
        let c = conn();
        let key = new_key().unwrap();
        assert!(key.starts_with("trk_") && key.len() == 52);
        c.execute(
            "INSERT INTO api_keys(name, prefix, hash, can_write, created) VALUES ('laptop', ?1, ?2, 1, 0)",
            [&key[..12], &hash(&key)],
        )
        .unwrap();
        let stored: String = c
            .query_row("SELECT hash FROM api_keys", [], |r| r.get(0))
            .unwrap();
        assert_ne!(stored, key, "the key itself is never stored");
        let caller = check_key(&c, &key).unwrap();
        assert_eq!(caller.key_name, "laptop");
        assert!(caller.write);
        assert!(check_key(&c, "trk_not-a-real-key").is_none());
    }

    #[test]
    fn the_server_is_off_until_switched_on() {
        let c = conn();
        let cfg = load(&c);
        assert!(!cfg.enabled && !cfg.lan);
        assert_eq!(cfg.port, DEFAULT_PORT);
        save(
            &c,
            Config {
                enabled: true,
                port: 9000,
                lan: true,
            },
        )
        .unwrap();
        let cfg = load(&c);
        assert!(cfg.enabled && cfg.lan);
        assert_eq!(cfg.port, 9000);
    }

    #[test]
    fn keys_are_read_from_bearer_basic_and_header() {
        let req = |name: &str, value: &str| {
            Request::builder()
                .header(name, value)
                .body(axum::body::Body::empty())
                .unwrap()
        };
        assert_eq!(
            presented_key(&req("authorization", "Bearer trk_abc")).as_deref(),
            Some("trk_abc")
        );
        // "agent:trk_abc"
        assert_eq!(
            presented_key(&req("authorization", "Basic YWdlbnQ6dHJrX2FiYw==")).as_deref(),
            Some("trk_abc")
        );
        assert_eq!(
            presented_key(&req("x-api-key", "trk_abc")).as_deref(),
            Some("trk_abc")
        );
        assert_eq!(presented_key(&req("authorization", "Digest nope")), None);
    }

    #[test]
    fn web_pages_from_other_sites_are_refused() {
        let req = |origin: Option<&str>| {
            let mut b = Request::builder();
            if let Some(o) = origin {
                b = b.header("origin", o);
            }
            b.body(axum::body::Body::empty()).unwrap()
        };
        assert!(origin_allowed(&req(None)), "agents send no Origin");
        assert!(origin_allowed(&req(Some("http://localhost:3000"))));
        assert!(origin_allowed(&req(Some("http://127.0.0.1:7811"))));
        assert!(!origin_allowed(&req(Some("https://evil.example"))));
        assert!(!origin_allowed(&req(Some("http://localhost.evil.example"))));
        assert!(!origin_allowed(&req(Some("null"))));
    }
}
