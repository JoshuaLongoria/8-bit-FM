use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Dir,
    File,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotableFiles {
    pub readme: Option<String>,
    pub gitignore: Option<String>,
    pub ci: Option<String>,
    pub configs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: NodeKind,
    pub file_count: usize,
    pub size_bytes: u64,
    pub depth: u8,
    pub children: Vec<FileNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoTree {
    pub root: String,
    pub name: String,
    pub is_git_repo: bool,
    pub node: FileNode,
    pub notable: NotableFiles,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresenceContributor {
    pub name: String,
    pub email: String,
    pub commit_count: usize,
    pub last_commit_iso: String,
    pub active_recently: bool,
    pub is_current_user: bool,
    pub current_acgtion: Option<String>
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContributorList {
    pub contributors: Vec<Contributor>,
    pub overflow_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoStatus {
    pub branch: String,
    pub dirty: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub ahead: usize,
    pub behind: usize,
}