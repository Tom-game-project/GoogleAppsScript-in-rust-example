//// GitHub-style quick setup instructions component for a selected or newly created repository.

import gas_git_ui/types
import gleam/option.{type Option, None, Some}
import lustre/element.{type Element, text}
import lustre/element/html

pub fn view_quick_setup(
  base_url: String,
  selected_project: Option(String),
) -> Element(msg) {
  case selected_project {
    None -> text("")
    Some(project_name) -> {
      let remote_url = types.format_remote_url(base_url, project_name)
      let new_repo_cmds = types.new_repo_setup_commands(base_url, project_name)
      let existing_repo_cmds =
        types.existing_repo_setup_commands(base_url, project_name)

      html.section([], [
        html.hr([]),
        html.h2([], [text("Quick setup — " <> project_name <> ".git")]),
        html.p([], [
          text("Remote URL: "),
          html.code([], [text(remote_url)]),
        ]),
        html.h3([], [
          text("…or create a new repository on the command line"),
        ]),
        html.pre([], [html.code([], [text(new_repo_cmds)])]),
        html.h3([], [
          text("…or push an existing repository from the command line"),
        ]),
        html.pre([], [html.code([], [text(existing_repo_cmds)])]),
      ])
    }
  }
}
