use crate::models::{FileNode, NodeKind, NotableFiles, RepoTree};
use std::fs;
use std::path::Path;

const DEFAULT_SKIP_LIST: &[&str] = &[
    ".git", "node_modules", "target", "dist", "build", 
    ".next", "__pycache__", "venv", ".venv", ".ds_store"
];

#[tauri::command]
pub async fn walk_repo(
    path: String,
    max_depth: Option<u8>,
    max_nodes: Option<usize>,
) -> Result<RepoTree, String> {
    let depth_limit = max_depth.unwrap_or(3);
    let node_limit = max_nodes.unwrap_or(5000);
    let root_path = Path::new(&path);

    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut total_nodes_scanned = 0;
    let mut truncated = false;

    let node = build_node(
        root_path,
        0,
        depth_limit,
        node_limit,
        &mut total_nodes_scanned,
        &mut truncated,
    )?;

    let is_git_repo = root_path.join(".git").exists();
    let notable = scan_notable_files(root_path);

    Ok(RepoTree {
        root: path.clone(),
        name: root_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone()),
        is_git_repo,
        node,
        notable,
        truncated,
    })
}

fn build_node(
    path: &Path,
    current_depth: u8,
    max_depth: u8,
    max_nodes: usize,
    scanned_count: &mut usize,
    truncated: &mut bool,
) -> Result<FileNode, String> {
    *scanned_count += 1;
    if *scanned_count > max_nodes {
        *truncated = true;
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let absolute_path = path.to_string_lossy().to_string();

    if path.is_file() {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        return Ok(FileNode {
            name,
            path: absolute_path,
            kind: NodeKind::File,
            file_count: 1,
            size_bytes: metadata.len(),
            depth: current_depth,
            children: vec![],
        });
    }

    let mut children = Vec::new();
    let mut total_file_count = 0;
    let mut total_size_bytes = 0;

    if current_depth < max_depth && !*truncated {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();

                if DEFAULT_SKIP_LIST.contains(&file_name.as_str()) {
                    continue;
                }

                if let Ok(child_node) = build_node(
                    &entry_path,
                    current_depth + 1,
                    max_depth,
                    max_nodes,
                    scanned_count,
                    truncated,
                ) {
                    total_file_count += child_node.file_count;
                    total_size_bytes += child_node.size_bytes;
                    children.push(child_node);
                }
            }
        }
    }

    Ok(FileNode {
        name,
        path: absolute_path,
        kind: NodeKind::Dir,
        file_count: total_file_count,
        size_bytes: total_size_bytes,
        depth: current_depth,
        children,
    })
}

fn scan_notable_files(root: &Path) -> NotableFiles {
    let mut notable = NotableFiles {
        readme: None,
        gitignore: None,
        ci: None,
        configs: Vec::new(),
    };

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            match name.as_str() {
                "README.md" | "README" => notable.readme = Some(name),
                ".gitignore" => notable.gitignore = Some(name),
                ".github" => notable.ci = Some(".github/workflows".to_string()),
                "Cargo.toml" | "package.json" | "pyproject.toml" => notable.configs.push(name),
                _ => {}
            }
        }
    }

    notable
}