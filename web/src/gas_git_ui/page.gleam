//// Main page module for the GAS Git Server Web UI.
////
//// Keeps `Model`, `Msg`, `init`, `update`, and `view` for the page together
//// in one file for clear MVU readability, while delegating domain helpers,
//// API `Effect` constructors, and UI section components to dedicated modules.

import gas_git_ui/api
import gas_git_ui/components/commit_view
import gas_git_ui/components/header
import gas_git_ui/components/quick_setup
import gas_git_ui/components/repo_form
import gas_git_ui/components/repo_list
import gas_git_ui/types.{type RepoCommits, type RepoSummary, type ServerState}
import gleam/dict.{type Dict}
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
    active_commits: Option(RepoCommits),
    cached_commits: Dict(String, RepoCommits),
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
      active_commits: None,
      cached_commits: dict.new(),
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

    OpenProjectCommits(project_name, head_oid) -> {
      case dict.get(model.cached_commits, project_name) {
        Ok(cached) if cached.head_oid == head_oid -> #(
          Model(
            ..model,
            view_mode: ViewCommits(project_name),
            active_commits: Some(types.RepoCommits(..cached, from_cache: True)),
            is_loading: False,
            error: None,
          ),
          effect.none(),
        )
        _ -> #(
          Model(
            ..model,
            view_mode: ViewCommits(project_name),
            active_commits: None,
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
      }
    }

    RepoCommitsReceived(Ok(repo_commits)) -> {
      let cached_entry = types.RepoCommits(..repo_commits, from_cache: True)
      let updated_cache =
        dict.insert(
          model.cached_commits,
          repo_commits.project_name,
          cached_entry,
        )
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
          cached_commits: updated_cache,
          active_commits: Some(repo_commits),
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
      Model(..model, view_mode: ViewOverview, is_loading: False),
      effect.none(),
    )

    ForceRefreshCommits(project_name, head_oid) -> {
      let cleared_cache = dict.delete(model.cached_commits, project_name)
      #(
        Model(
          ..model,
          cached_commits: cleared_cache,
          is_loading: True,
          error: None,
        ),
        api.fetch_repo_commits(project_name, head_oid, True, RepoCommitsReceived),
      )
    }
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
              model.is_loading,
              BackToOverview,
              ForceRefreshCommits(
                repo_commits.project_name,
                repo_commits.head_oid,
              ),
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
