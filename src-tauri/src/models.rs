use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInfo {
    pub branch: String,
    pub is_dirty: bool,
    pub modified_count: usize,
    pub untracked_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoTree {
    pub root: String,
    pub name: String,
    pub is_git_repo: bool,
    pub node: FileNode,
    pub truncated: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub file_count: usize,
    pub size_bytes: u64,
    pub depth: usize,
    pub children: Vec<FileNode>,
}