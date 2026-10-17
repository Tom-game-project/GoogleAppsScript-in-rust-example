//// Controlled Lustre `Effect` bindings for communicating with the GAS backend.
////
//// All external communication is wrapped in `lustre/effect.from` without using
//// `lustre/event.emit` or impure side effects in `update` / `view`.

import gas_git_ui/types.{type RepoCommits, type ServerState}
import lustre/effect.{type Effect}

@external(javascript, "./gas_git_ffi.mjs", "loadInitialOrRemoteState")
fn ffi_load_initial_or_remote_state(
  on_success: fn(ServerState) -> Nil,
  on_error: fn(String) -> Nil,
) -> Nil

@external(javascript, "./gas_git_ffi.mjs", "fetchRepositories")
fn ffi_fetch_repositories(
  on_success: fn(ServerState) -> Nil,
  on_error: fn(String) -> Nil,
) -> Nil

@external(javascript, "./gas_git_ffi.mjs", "createRepository")
fn ffi_create_repository(
  project_name: String,
  description: String,
  on_success: fn(ServerState) -> Nil,
  on_error: fn(String) -> Nil,
) -> Nil

@external(javascript, "./gas_git_ffi.mjs", "fetchRepoCommits")
fn ffi_fetch_repo_commits(
  project_name: String,
  head_oid: String,
  force_refresh: Bool,
  on_success: fn(RepoCommits) -> Nil,
  on_error: fn(String) -> Nil,
) -> Nil

/// Load hydrated initial state if available, or fetch the repository list from the server.
pub fn load_initial_state(
  to_msg: fn(Result(ServerState, String)) -> msg,
) -> Effect(msg) {
  effect.from(fn(dispatch) {
    ffi_load_initial_or_remote_state(
      fn(state) { dispatch(to_msg(Ok(state))) },
      fn(err) { dispatch(to_msg(Error(err))) },
    )
  })
}

/// Fetch the current list of Git repositories in the configured Google Drive folder (`GIT_DRIVE_FOLDER_ID`).
pub fn fetch_repositories(
  to_msg: fn(Result(ServerState, String)) -> msg,
) -> Effect(msg) {
  effect.from(fn(dispatch) {
    ffi_fetch_repositories(
      fn(state) { dispatch(to_msg(Ok(state))) },
      fn(err) { dispatch(to_msg(Error(err))) },
    )
  })
}

/// Request creation of a new empty Git repository (`<project_name>.git`) in Google Drive.
pub fn create_repository(
  project_name: String,
  description: String,
  to_msg: fn(Result(ServerState, String)) -> msg,
) -> Effect(msg) {
  effect.from(fn(dispatch) {
    ffi_create_repository(
      project_name,
      description,
      fn(state) { dispatch(to_msg(Ok(state))) },
      fn(err) { dispatch(to_msg(Error(err))) },
    )
  })
}

/// Fetch commit history and decoration for a repository with client-side caching by `${project_name}:${head_oid}`.
pub fn fetch_repo_commits(
  project_name: String,
  head_oid: String,
  force_refresh: Bool,
  to_msg: fn(Result(RepoCommits, String)) -> msg,
) -> Effect(msg) {
  effect.from(fn(dispatch) {
    ffi_fetch_repo_commits(
      project_name,
      head_oid,
      force_refresh,
      fn(commits) { dispatch(to_msg(Ok(commits))) },
      fn(err) { dispatch(to_msg(Error(err))) },
    )
  })
}
