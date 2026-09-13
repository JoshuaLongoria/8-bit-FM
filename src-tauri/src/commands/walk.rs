use crate::models::{FileNode, RepoTree};
use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn walk_repo(path: String) -> Result<RepoTree, String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("Directory does not exist".into());
    }

    let name = target
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let root_node = build_tree(target, 0)?;

    Ok(RepoTree {
        root: path.clone(),
        name,
        is_git_repo: target.join(".git").exists(),
        node: root_node,
        truncated: false,
    })
}

fn build_tree(path: &Path, depth: usize) -> Result<FileNode, String> {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let is_dir = path.is_dir();
    let mut file_count = 0;
    let mut size_bytes = 0;
    let mut children = Vec::new();

    if is_dir {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if let Some(file_name) = entry_path.file_name() {
                    let name_str = file_name.to_string_lossy();
                    if name_str == ".git" || name_str == "node_modules" || name_str == "target" {
                        continue;
                    }
                }
                file_count += 1;
                if let Ok(child_node) = build_tree(&entry_path, depth + 1) {
                    size_bytes += child_node.size_bytes;
                    children.push(child_node);
                }
            }
        }
    } else if let Ok(metadata) = fs::metadata(path) {
        size_bytes = metadata.len();
    }

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        kind: if is_dir { "dir".into() } else { "file".into() },
        file_count,
        size_bytes,
        depth,
        children,
    })
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let repo_root = current_dir.parent().unwrap_or(&current_dir);

    let path_clean = path.strip_prefix("8-bit-FM/").unwrap_or(&path);

    let candidates = vec![
        repo_root.join(path_clean),
        current_dir.join(path_clean),
        repo_root.join(&path),
        std::path::PathBuf::from(&path),
    ];

    let mut target = None;
    for candidate in candidates {
        if candidate.exists() && candidate.is_file() {
            target = Some(candidate);
            break;
        }
    }

    let target = match target {
        Some(t) => t,
        None => return Err(format!("File does not exist: {}", path)),
    };

    fs::read_to_string(target).map_err(|e| e.to_string())
}