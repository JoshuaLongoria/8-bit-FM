mod commands;
mod models;

use commands::dialog::{pick_directory, reveal_in_os};
use commands::git::{get_contributors, get_status};
use commands::presence::get_live_presence;
use commands::walk::walk_repo;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            walk_repo,
            get_contributors,
            get_status,
            pick_directory,
            reveal_in_os,
            get_live_presence
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}