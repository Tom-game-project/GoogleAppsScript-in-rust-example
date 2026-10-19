//// Main page module for the GAS Git Server Web UI.
////
//// Keeps `Model`, `Msg`, `init`, `update`, and `view` for the page together
//// in one file for clear MVU readability, while delegating domain helpers,
//// API `Effect` constructors, and UI section components to dedicated modules.
////
//// Caching is handled exclusively via persistent browser storage (`IndexedDB`
//// with `window.caches` and `localStorage` fallback in `gas_git_ffi.mjs`)
//// without holding cache dictionaries in memory inside `Model`.

import gas_git_ui/api
import gas_git_ui/components/commit_view
import gas_git_ui/components/header
import gas_git_ui/components/quick_setup
import gas_git_ui/components/repo_form
import gas_git_ui/components/repo_list
import gas_git_ui/types.{
  type CommitDetail, type CommitInspectorTab, type HistoryTab, type RepoCommits,
  type RepoSummary, type ServerState, InspectorChanges, InspectorDirectoryTree,
  TabGraph,
}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/effect.{type Effect}
import lustre/element.{type Element}
import lustre/element/html
import lustre/event

// ============================================================================
// Page Model & Msg
// ============================================================================

pub type ViewMode {
  ViewOverview
  ViewCommits(project_name: String)
}

pub type Model {
  Model(
    drive_folder_configured: Bool,
    drive_folder_id: String,
    drive_folder_url: String,
    base_url: String,
    repositories: List(RepoSummary),
    selected_project: Option(String),
    new_repo_name: String,
    new_repo_description: String,
    view_mode: ViewMode,
    history_tab: HistoryTab,
    active_commits: Option(RepoCommits),
    commit_page: Int,
    selected_commit_oid: Option(String),
    active_commit_detail: Option(CommitDetail),
    is_detail_loading: Bool,
    inspector_tab: CommitInspectorTab,
    current_dir: String,
    selected_file_path: Option(String),
    is_loading: Bool,
    message: Option(String),
    error: Option(String),
  )
}

pub type Msg {
  ServerStateReceived(Result(ServerState, String))
  UpdateNewRepoName(String)
  UpdateNewRepoDescription(String)
  SubmitCreateRepo
  SelectProject(Option(String))
  RefreshRepositories
  OpenProjectCommits(project_name: String, head_oid: String)
  RepoCommitsReceived(Result(RepoCommits, String))
  BackToOverview
  ForceRefreshCommits(project_name: String, head_oid: String)
  SwitchHistoryTab(HistoryTab)
  SelectCommitPage(page: Int)
  SelectCommitForInspection(commit_oid: String)
  CommitDetailReceived(Result(CommitDetail, String))
  CloseCommitInspector
  SwitchInspectorTab(CommitInspectorTab)
  NavigateCommitDirectory(dir_path: String)
  SelectCommitFile(Option(String))
  OpenFileInTree(file_path: String)
}

// ============================================================================
// Page Init, Update & View
// ============================================================================

pub fn init(_flags: Nil) -> #(Model, Effect(Msg)) {
  let initial_model =
    Model(
      drive_folder_configured: False,
      drive_folder_id: "",
      drive_folder_url: "",
      base_url: "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
      repositories: [],
      selected_project: None,
      new_repo_name: "",
      new_repo_description: "",
      view_mode: ViewOverview,
      history_tab: TabGraph,
      active_commits: None,
      commit_page: 1,
      selected_commit_oid: None,
      active_commit_detail: None,
      is_detail_loading: False,
      inspector_tab: InspectorChanges,
      current_dir: "",
      selected_file_path: None,
      is_loading: True,
      message: None,
      error: None,
    )
  #(initial_model, api.load_initial_state(ServerStateReceived))
}

pub fn update(model: Model, msg: Msg) -> #(Model, Effect(Msg)) {
  case msg {
    ServerStateReceived(Ok(state)) -> {
      let next_selected = case types.non_empty_option(state.selected_project) {
        Some(sel) -> Some(sel)
        None ->
          case model.selected_project {
            Some(existing) -> Some(existing)
            None ->
              case state.repositories {
                [first, ..] -> Some(first.name)
                [] -> None
              }
          }
      }

      let next_model =
        Model(
          ..model,
          drive_folder_configured: state.drive_folder_configured,
          drive_folder_id: state.drive_folder_id,
          drive_folder_url: state.drive_folder_url,
          base_url: state.base_url,
          repositories: state.repositories,
          selected_project: next_selected,
          is_loading: False,
          message: types.non_empty_option(state.message),
          error: types.non_empty_option(state.error),
        )
      #(next_model, effect.none())
    }

    ServerStateReceived(Error(err)) -> #(
      Model(..model, is_loading: False, error: Some(err)),
      effect.none(),
    )

    UpdateNewRepoName(name) -> #(
      Model(..model, new_repo_name: name, error: None),
      effect.none(),
    )

    UpdateNewRepoDescription(desc) -> #(
      Model(..model, new_repo_description: desc),
      effect.none(),
    )

    SubmitCreateRepo -> {
      let clean_name = types.normalize_repo_name(model.new_repo_name)
      case clean_name {
        "" -> #(
          Model(
            ..model,
            error: Some(
              "プロジェクト名を入力してください (Repository name is required)",
            ),
          ),
          effect.none(),
        )
        _ -> #(
          Model(
            ..model,
            new_repo_name: "",
            new_repo_description: "",
            is_loading: True,
            message: None,
            error: None,
          ),
          api.create_repository(
            clean_name,
            string.trim(model.new_repo_description),
            ServerStateReceived,
          ),
        )
      }
    }

    SelectProject(selection) -> #(
      Model(..model, selected_project: selection),
      effect.none(),
    )

    RefreshRepositories -> #(
      Model(..model, is_loading: True, message: None, error: None),
      api.fetch_repositories(ServerStateReceived),
    )

    OpenProjectCommits(project_name, head_oid) -> #(
      Model(
        ..model,
        view_mode: ViewCommits(project_name),
        active_commits: None,
        commit_page: 1,
        selected_commit_oid: None,
        active_commit_detail: None,
        is_detail_loading: False,
        current_dir: "",
        selected_file_path: None,
        is_loading: True,
        error: None,
      ),
      api.fetch_repo_commits(
        project_name,
        head_oid,
        False,
        RepoCommitsReceived,
      ),
    )

    RepoCommitsReceived(Ok(repo_commits)) -> {
      let updated_repositories =
        list.map(model.repositories, fn(repo) {
          case repo.name == repo_commits.project_name {
            True ->
              types.RepoSummary(
                ..repo,
                head_oid: repo_commits.head_oid,
                default_branch: repo_commits.default_branch,
              )
            False -> repo
          }
        })
      #(
        Model(
          ..model,
          repositories: updated_repositories,
          active_commits: Some(repo_commits),
          commit_page: 1,
          is_loading: False,
          error: None,
        ),
        effect.none(),
      )
    }

    RepoCommitsReceived(Error(err)) -> #(
      Model(..model, is_loading: False, error: Some(err)),
      effect.none(),
    )

    BackToOverview -> #(
      Model(
        ..model,
        view_mode: ViewOverview,
        selected_commit_oid: None,
        active_commit_detail: None,
        is_detail_loading: False,
        is_loading: False,
      ),
      effect.none(),
    )

    ForceRefreshCommits(project_name, head_oid) -> #(
      Model(
        ..model,
        commit_page: 1,
        selected_commit_oid: None,
        active_commit_detail: None,
        is_detail_loading: False,
        is_loading: True,
        error: None,
      ),
      api.fetch_repo_commits(project_name, head_oid, True, RepoCommitsReceived),
    )

    SwitchHistoryTab(tab) -> #(
      Model(..model, history_tab: tab),
      effect.none(),
    )

    SelectCommitPage(page) -> #(
      Model(..model, commit_page: int.max(1, page)),
      effect.none(),
    )

    SelectCommitForInspection(commit_oid) -> {
      let project_name = case model.view_mode {
        ViewCommits(proj) -> proj
        ViewOverview -> ""
      }
      case project_name {
        "" -> #(model, effect.none())
        _ -> #(
          Model(
            ..model,
            selected_commit_oid: Some(commit_oid),
            active_commit_detail: None,
            is_detail_loading: True,
            current_dir: "",
            selected_file_path: None,
            error: None,
          ),
          api.fetch_commit_detail(
            project_name,
            commit_oid,
            False,
            CommitDetailReceived,
          ),
        )
      }
    }

    CommitDetailReceived(Ok(detail)) -> {
      let first_tree_blob = case
        list.find(detail.tree_entries, fn(e) { e.kind == "blob" })
      {
        Ok(first_blob) -> Some(first_blob.path)
        Error(Nil) -> None
      }
      let default_file = case detail.changes {
        [first_change, ..] ->
          case first_change.status == "deleted" {
            True -> first_tree_blob
            False -> Some(first_change.path)
          }
        [] -> first_tree_blob
      }
      #(
        Model(
          ..model,
          active_commit_detail: Some(detail),
          is_detail_loading: False,
          selected_file_path: default_file,
          error: None,
        ),
        effect.none(),
      )
    }

    CommitDetailReceived(Error(err)) -> #(
      Model(..model, is_detail_loading: False, error: Some(err)),
      effect.none(),
    )

    CloseCommitInspector -> #(
      Model(
        ..model,
        selected_commit_oid: None,
        active_commit_detail: None,
        is_detail_loading: False,
      ),
      effect.none(),
    )

    SwitchInspectorTab(tab) -> #(
      Model(..model, inspector_tab: tab),
      effect.none(),
    )

    NavigateCommitDirectory(dir_path) -> #(
      Model(..model, current_dir: dir_path),
      effect.none(),
    )

    SelectCommitFile(file_path_opt) -> #(
      Model(..model, selected_file_path: file_path_opt),
      effect.none(),
    )

    OpenFileInTree(file_path) -> #(
      Model(
        ..model,
        inspector_tab: InspectorDirectoryTree,
        current_dir: types.parent_directory(file_path),
        selected_file_path: Some(file_path),
      ),
      effect.none(),
    )
  }
}

pub fn view(model: Model) -> Element(Msg) {
  html.div([attribute.id("gas-git-web-ui")], [
    header.view_header(
      model.drive_folder_configured,
      model.drive_folder_id,
      model.drive_folder_url,
    ),
    header.view_banners(model.is_loading, model.message, model.error),
    html.hr([]),
    case model.view_mode {
      ViewCommits(_) -> {
        case model.active_commits {
          Some(repo_commits) ->
            commit_view.view_commit_history(
              repo_commits,
              model.commit_page,
              model.history_tab,
              model.selected_commit_oid,
              model.active_commit_detail,
              model.is_loading,
              model.is_detail_loading,
              model.inspector_tab,
              model.current_dir,
              model.selected_file_path,
              BackToOverview,
              ForceRefreshCommits(
                repo_commits.project_name,
                repo_commits.head_oid,
              ),
              SwitchHistoryTab,
              SelectCommitPage,
              SelectCommitForInspection,
              CloseCommitInspector,
              SwitchInspectorTab,
              NavigateCommitDirectory,
              SelectCommitFile,
              OpenFileInTree,
            )
          None ->
            html.div([], [
              html.button(
                [attribute.type_("button"), event.on_click(BackToOverview)],
                [element.text("← Back to repositories / プロジェクト一覧に戻る")],
              ),
              html.p([], [
                element.text("Loading commit history and graph..."),
              ]),
            ])
        }
      }
      ViewOverview ->
        html.div([], [
          repo_form.view_create_repository_form(
            model.base_url,
            model.new_repo_name,
            model.new_repo_description,
            model.is_loading,
            UpdateNewRepoName,
            UpdateNewRepoDescription,
            SubmitCreateRepo,
          ),
          html.hr([]),
          repo_list.view_repositories_table(
            model.base_url,
            model.repositories,
            model.is_loading,
            RefreshRepositories,
            SelectProject,
            OpenProjectCommits,
          ),
          quick_setup.view_quick_setup(model.base_url, model.selected_project),
        ])
    },
  ])
}
