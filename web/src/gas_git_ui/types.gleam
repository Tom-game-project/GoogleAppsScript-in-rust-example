//// Domain types and pure helper functions for the GAS Git Server Web UI.

import gleam/option.{type Option, None, Some}
import gleam/string

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
