// src-tauri/src/commands/dialog.rs
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn pick_directory(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
pub async fn reveal_in_os(_path: String) -> Result<(), String> {
    Ok(())
}