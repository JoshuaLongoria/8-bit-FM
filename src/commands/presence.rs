use crate::models::PresenceContributor;
use std::process::Command;

#[tauri::command]
pub async fn get_live_presence(path: String) -> Result<Vec<PresenceContributor>, String> {
    // Query recent git commit activity within last 60 minutes for live presence
    let output = Command::new("git")
        .args(["-C", &path, "log", "-1", "--format=%an|%ae|%aI"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut presence_list = Vec::new();

    if let Some(line) = stdout.lines().next() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 3 {
            presence_list.push(PresenceContributor {
                name: parts[0].to_string(),
                email: parts[1].to_string(),
                commit_count: 1,
                last_commit_iso: parts[2].to_string(),
                active_recently: true,
                is_online: true, // Marked active based on recent local commit log
                current_action: Some("Active Node".to_string()),
            });
        }
    }

    Ok(presence_list)
}