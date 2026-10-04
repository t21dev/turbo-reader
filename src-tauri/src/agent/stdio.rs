//! `turbo-reader --mcp`: the MCP server over stdin and stdout, with no window.
//!
//! An agent such as Codex or Claude Code starts this itself when it needs
//! Turbo Reader, so it works with the app closed. It opens the same library
//! the app uses (the portable one when there is a `portable` file), and only
//! reads unless started with `--allow-write`.

use super::server::TurboTools;
use crate::commands::AppState;
use crate::{background, db, feed};
use rmcp::ServiceExt;
use std::sync::Mutex;

pub fn run(identifier: &str, allow_write: bool) -> i32 {
    match serve(identifier, allow_write) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("turbo-reader --mcp: {e}");
            1
        }
    }
}

fn serve(identifier: &str, allow_write: bool) -> Result<(), String> {
    let dir = crate::portable_data_dir()
        .or_else(|| dirs::data_dir().map(|d| d.join(identifier)))
        .ok_or("Could not find the user's data folder.")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = db::open(&dir.join("turbo-reader.db")).map_err(|e| e.to_string())?;
    let state: &'static AppState = Box::leak(Box::new(AppState {
        db: Mutex::new(conn),
        http: feed::client().map_err(|e| e.to_string())?,
        fetching: tokio::sync::Mutex::new(()),
        background: background::Live::default(),
        mcp: super::http::McpControl::default(),
    }));
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let server = TurboTools::new(state, None, allow_write)
            .serve(rmcp::transport::stdio())
            .await
            .map_err(|e| e.to_string())?;
        server.waiting().await.map_err(|e| e.to_string())?;
        Ok(())
    })
}
