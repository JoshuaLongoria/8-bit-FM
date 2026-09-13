use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn pick_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app_handle.dialog().file().pick_folder(move |folder_path| {
        let _ = tx.send(folder_path.map(|p| p.to_string()));
    });

    rx.recv()
        .map_err(|_| "Failed to receive selected folder path".to_string())
}

#[tauri::command]
pub async fn reveal_in_os(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path in Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path in Explorer: {}", e))?;
    }

    Ok(())
}