//// Existing Git repositories overview list/table UI component.

import gas_git_ui/types.{type RepoSummary}
import gleam/int
import gleam/list
import gleam/option.{type Option, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event

pub fn view_repositories_table(
  base_url: String,
  repositories: List(RepoSummary),
  is_loading: Bool,
  on_refresh: msg,
  on_select_project: fn(Option(String)) -> msg,
) -> Element(msg) {
  let count_str = int.to_string(list.length(repositories))

  html.section([], [
    html.h2([], [
      text("Repositories (" <> count_str <> ") / 既存 Git プロジェクト一覧 "),
      html.button(
        [
          attribute.type_("button"),
          attribute.disabled(is_loading),
          event.on_click(on_refresh),
        ],
        [text("Refresh / 更新")],
      ),
    ]),
    case repositories {
      [] ->
        html.p([], [
          text(
            "まだリポジトリがありません。上のフォームから新しいリポジトリを作成してください。(No repositories found in Google Drive folder.)",
          ),
        ])
      repos ->
        html.table([attribute.attribute("border", "1")], [
          html.thead([], [
            html.tr([], [
              html.th([], [text("Repository")]),
              html.th([], [text("Description")]),
              html.th([], [text("Status / HEAD")]),
              html.th([], [text("Branches")]),
              html.th([], [text("Remote URL (git remote add)")]),
              html.th([], [text("Actions")]),
            ]),
          ]),
          html.tbody(
            [],
            list.map(repos, fn(repo) {
              view_repo_row(base_url, repo, on_select_project)
            }),
          ),
        ])
    },
  ])
}

fn view_repo_row(
  base_url: String,
  repo: RepoSummary,
  on_select_project: fn(Option(String)) -> msg,
) -> Element(msg) {
  let remote_url = types.format_remote_url(base_url, repo.name)
  let status_text = types.format_repo_status(repo)

  html.tr([], [
    html.td([], [html.strong([], [text(repo.folder_name)])]),
    html.td([], [text(repo.description)]),
    html.td([], [html.code([], [text(status_text)])]),
    html.td([], [text(int.to_string(repo.branch_count))]),
    html.td([], [html.code([], [text(remote_url)])]),
    html.td([], [
      html.button(
        [
          attribute.type_("button"),
          event.on_click(on_select_project(Some(repo.name))),
        ],
        [text("Quick Setup / 使い方")],
      ),
      text(" "),
      case string.trim(repo.folder_url) {
        "" -> text("")
        url ->
          html.a(
            [attribute.href(url), attribute.target("_blank")],
            [text("[Drive Folder]")],
          )
      },
    ]),
  ])
}
