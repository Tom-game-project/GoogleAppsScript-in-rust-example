//// Domain types and pure helper functions for the GAS Git Server Web UI.

import gleam/int
import gleam/option.{type Option, None, Some}
import gleam/string

/// Controls whether the repository history page displays the SVG Tree Graph or the Commit Log table.
pub type HistoryTab {
  TabGraph
  TabCommitLog
}

/// Controls whether the Commit Inspector displays file diffs or the directory/file tree browser.
pub type CommitInspectorTab {
  InspectorChanges
  InspectorDirectoryTree
}

/// Metadata for a single Git repository stored in Google Drive (`<GIT_DRIVE_FOLDER_ID>/<name>.git`).
pub type RepoSummary {
  RepoSummary(
    name: String,
    folder_name: String,
    folder_id: String,
    folder_url: String,
    description: String,
    default_branch: String,
    head_oid: String,
    branch_count: Int,
  )
}

/// Payload returned from the GAS Git Server (`git_list_repos` / `git_create_repo`).
pub type ServerState {
  ServerState(
    ok: Bool,
    drive_folder_configured: Bool,
    drive_folder_id: String,
    drive_folder_url: String,
    base_url: String,
    selected_project: String,
    repositories: List(RepoSummary),
    message: String,
    error: String,
  )
}

/// Single commit entry in a repository's history.
pub type Commit {
  Commit(
    oid: String,
    short_oid: String,
    parents: List(String),
    author_name: String,
    author_email: String,
    timestamp: Int,
    summary: String,
    body: String,
    refs: List(String),
  )
}

/// Response containing commit history for a repository, including persistent browser cache status.
pub type RepoCommits {
  RepoCommits(
    ok: Bool,
    project_name: String,
    head_oid: String,
    default_branch: String,
    commits: List(Commit),
    from_cache: Bool,
    cache_backend: String,
    error: String,
  )
}

/// Single file change entry (diff) in a specific commit compared to its first parent.
pub type CommitFileChange {
  CommitFileChange(
    path: String,
    status: String,
    old_oid: String,
    new_oid: String,
    additions: Int,
    deletions: Int,
    patch: String,
  )
}

/// Single directory (`"tree"`) or file (`"blob"`) entry in a commit's full tree snapshot.
pub type CommitTreeEntry {
  CommitTreeEntry(
    path: String,
    name: String,
    parent_dir: String,
    kind: String,
    oid: String,
    size: Int,
    content: String,
    is_binary: Bool,
  )
}

/// Detailed commit snapshot containing both file changes (diff) and the full directory/file tree.
pub type CommitDetail {
  CommitDetail(
    ok: Bool,
    project_name: String,
    oid: String,
    short_oid: String,
    tree_oid: String,
    parents: List(String),
    author_name: String,
    author_email: String,
    timestamp: Int,
    summary: String,
    body: String,
    refs: List(String),
    changes: List(CommitFileChange),
    tree_entries: List(CommitTreeEntry),
    from_cache: Bool,
    cache_backend: String,
    error: String,
  )
}

/// Convert a possibly empty string into an `Option(String)`.
pub fn non_empty_option(value: String) -> Option(String) {
  let trimmed = string.trim(value)
  case trimmed {
    "" -> None
    _ -> Some(trimmed)
  }
}

/// Normalize a user-entered repository name by trimming whitespace and stripping a trailing `.git` suffix.
pub fn normalize_repo_name(raw_name: String) -> String {
  let trimmed = string.trim(raw_name)
  case string.ends_with(trimmed, ".git") {
    True -> string.drop_end(trimmed, 4)
    False -> trimmed
  }
}

/// Build the `gas::` Git remote URL for a given base `/exec` URL and project name.
pub fn format_remote_url(base_url: String, project_name: String) -> String {
  let clean_name = case normalize_repo_name(project_name) {
    "" -> "project_name"
    name -> name
  }
  "gas::" <> base_url <> "/" <> clean_name <> ".git"
}

/// Format the status summary string for a repository row.
pub fn format_repo_status(repo: RepoSummary) -> String {
  case string.trim(repo.head_oid) {
    "" -> "Empty repository (0 commits)"
    oid ->
      repo.default_branch
      <> " ("
      <> string.slice(oid, 0, 7)
      <> ")"
  }
}

/// Compute the parent directory path of a given slash-separated directory path.
pub fn parent_directory(dir_path: String) -> String {
  let trimmed = string.trim(dir_path)
  case trimmed {
    "" -> ""
    _ -> {
      let parts = string.split(trimmed, "/")
      let count = count_items(parts, 0)
      case count <= 1 {
        True -> ""
        False -> join_first_n(parts, count - 1, "")
      }
    }
  }
}

fn count_items(items: List(a), acc: Int) -> Int {
  case items {
    [] -> acc
    [_, ..rest] -> count_items(rest, acc + 1)
  }
}

fn join_first_n(items: List(String), remaining: Int, acc: String) -> String {
  case remaining <= 0, items {
    True, _ -> acc
    False, [] -> acc
    False, [head, ..tail] -> {
      let next_acc = case acc {
        "" -> head
        _ -> acc <> "/" <> head
      }
      join_first_n(tail, remaining - 1, next_acc)
    }
  }
}

/// Format a Unix timestamp (seconds since 1970-01-01T00:00:00Z) as `YYYY-MM-DD HH:MM:SS UTC`.
pub fn format_timestamp(ts: Int) -> String {
  case ts <= 0 {
    True -> "-"
    False -> {
      let days = ts / 86_400
      let rem_sec = ts % 86_400
      let hour = rem_sec / 3600
      let minute = { rem_sec % 3600 } / 60
      let second = rem_sec % 60

      let z = days + 719_468
      let era = z / 146_097
      let doe = z - era * 146_097
      let yoe =
        { doe - doe / 1460 + doe / 36_524 - doe / 146_096 } / 365
      let y = yoe + era * 400
      let doy = doe - { 365 * yoe + yoe / 4 - yoe / 100 }
      let mp = { 5 * doy + 2 } / 153
      let d = doy - { 153 * mp + 2 } / 5 + 1
      let m = case mp < 10 {
        True -> mp + 3
        False -> mp - 9
      }
      let year = case m <= 2 {
        True -> y + 1
        False -> y
      }

      int.to_string(year)
      <> "-"
      <> pad2(m)
      <> "-"
      <> pad2(d)
      <> " "
      <> pad2(hour)
      <> ":"
      <> pad2(minute)
      <> ":"
      <> pad2(second)
      <> " UTC"
    }
  }
}

fn pad2(n: Int) -> String {
  case n < 10 {
    True -> "0" <> int.to_string(n)
    False -> int.to_string(n)
  }
}

/// Generate the GitHub-style command block for initializing a brand-new local repository and pushing to GAS.
pub fn new_repo_setup_commands(base_url: String, project_name: String) -> String {
  let remote_url = format_remote_url(base_url, project_name)
  "echo \"# "
  <> project_name
  <> "\" >> README.md\n"
  <> "git init\n"
  <> "git add README.md\n"
  <> "git commit -m \"first commit\"\n"
  <> "git branch -M main\n"
  <> "git remote add origin "
  <> remote_url
  <> "\n"
  <> "git push -u origin main"
}

/// Generate the GitHub-style command block for pushing an existing local repository to GAS.
pub fn existing_repo_setup_commands(
  base_url: String,
  project_name: String,
) -> String {
  let remote_url = format_remote_url(base_url, project_name)
  "git remote add origin "
  <> remote_url
  <> "\n"
  <> "git branch -M main\n"
  <> "git push -u origin main"
}
