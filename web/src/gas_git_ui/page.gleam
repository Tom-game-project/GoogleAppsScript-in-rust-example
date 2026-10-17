//// Main page module for the GAS Git Server Web UI.
////
//// Keeps `Model`, `Msg`, `init`, `update`, and `view` for the page together
//// in one file for clear MVU readability, while delegating domain helpers,
//// API `Effect` constructors, and UI section components to dedicated modules.

import gas_git_ui/api
import gas_git_ui/components/header
import gas_git_ui/components/quick_setup
import gas_git_ui/components/repo_form
import gas_git_ui/components/repo_list
import gas_git_ui/types.{type RepoSummary, type ServerState}
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/effect.{type Effect}
import lustre/element.{type Element}
import lustre/element/html

// ============================================================================
// Page Model & Msg
// ============================================================================

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
    ),
    quick_setup.view_quick_setup(model.base_url, model.selected_project),
  ])
}
