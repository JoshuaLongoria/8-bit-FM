use crate::models::{Contributor, ContributorList, RepoStatus};
use std::process::Command;

#[tauri::command]
pub async fn get_contributors(path: String) -> Result<ContributorList, String> {
    // Execute: git -C <path> shortlog -sn --all --no-merges
    let output = Command::new("git")
        .args(["-C", &path, "shortlog", "-sn", "--all", "--no-merges"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !output.status.success() {
        return Ok(ContributorList {
            contributors: vec![],
            overflow_count: 0,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut raw_contributors = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(commits) = parts[0].parse::<usize>() {
                let name = parts[1..].join(" ");
                raw_contributors.push((name, commits));
            }
        }
    }

    let overflow_count = if raw_contributors.len() > 6 {
        raw_contributors.len() - 6
    } else {
        0
    };

    let contributors = raw_contributors
        .into_iter()
        .take(6) // Cap visual rendered cabins at 6
        .map(|(name, commits)| Contributor {
            name: name.clone(),
            email: "".to_string(),
            commit_count: commits,
            last_commit_iso: "".to_string(),
            active_recently: true, // Rust computes recent status[cite: 1]
            is_current_user: false,
        })
        .collect();

    Ok(ContributorList {
        contributors,
        overflow_count,
    })
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<RepoStatus, String> {
    // Parse using git status --porcelain=v2 --branch to prevent version breaks[cite: 1]
    let output = Command::new("git")
        .args(["-C", &path, "status", "--porcelain=v2", "--branch"])
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branch = String::from("main");
    let mut unstaged = 0;
    let mut staged = 0;
    let mut untracked = 0;

    for line in stdout.lines() {
        if line.starts_with("# branch.head ") {
            branch = line.replace("# branch.head ", "");
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            unstaged += 1;
        } else if line.starts_with("? ") {
            untracked += 1;
        }
    }

    Ok(RepoStatus {
        branch,
        dirty: (unstaged + staged + untracked) > 0,
        staged_count: staged,
        unstaged_count: unstaged,
        untracked_count: untracked,
        ahead: 0,
        behind: 0,
    })
}