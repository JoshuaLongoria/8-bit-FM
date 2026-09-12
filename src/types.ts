

export interface RepoMeta {
    /* name, branch, is_dirty */
name: string
branch: string
is_dirty: boolean
}

interface NodeBase {
  name: string
  path: string
  git_status: string
}

export interface DirNode extends NodeBase {
  kind: 'dir'
  file_count: number
  children: FileNode[]
}

export interface FileLeaf extends NodeBase {
  kind: 'file'
}

export type FileNode = DirNode | FileLeaf

export interface RepoPayload { 
    repo: RepoMeta
    root: FileNode }


export interface Row { 
    node: FileNode
    level: number
    posinset: number
    setsize: number
}