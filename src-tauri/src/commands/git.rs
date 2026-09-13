use crate::models::GitStatusInfo;

#[tauri::command]
pub async fn get_status(_path: String) -> Result<GitStatusInfo, String> {
    Ok(GitStatusInfo {
        branch: "main".to_string(),
        is_dirty: true,
        modified_count: 3,
        untracked_count: 1,
    })
}

#[tauri::command]
pub async fn get_contributors(_path: String) -> Result<Vec<String>, String> {
    Ok(vec!["JoshuaLongoria".to_string()])
}
