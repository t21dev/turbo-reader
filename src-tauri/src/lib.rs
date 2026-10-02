//! Turbo Reader, a fast and modern RSS reader.
//!
//! Feed fetching, parsing and HTML sanitising all happen here in Rust, off the
//! UI thread. The webview only ever receives content that has been through the
//! allowlist in `feed::sanitise`, which is what makes a malformed article
//! unable to take the window down with it.

mod commands;
mod db;
mod feed;
mod markdown;
mod opml;
mod readable;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("turbo-reader.db"))?;
            let http = feed::client()?;
            app.manage(AppState {
                db: Mutex::new(conn),
                http,
            });
            Ok(())
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
            commands::read_text_file,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Turbo Reader");
}
