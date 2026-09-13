// src-tauri/src/commands/presence.rs
#[tauri::command]
pub async fn get_live_presence() -> Result<Vec<String>, String> {
    Ok(vec![])
}