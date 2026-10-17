//// Commit history and SVG graph view component.
////
//// Renders commit history (`git log --graph --decorate`), commit metadata,
//// branch/tag decoration badges, and cache hit/miss indicators.

import gas_git_ui/graph
import gas_git_ui/types.{type Commit, type RepoCommits}
import gleam/int
import gleam/list
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event

pub fn view_commit_history(
  repo_commits: RepoCommits,
  is_loading: Bool,
  on_back: msg,
  on_force_refresh: msg,
) -> Element(msg) {
  let commit_count = list.length(repo_commits.commits)
  let count_label = int.to_string(commit_count)

  html.section([], [
    html.div([], [
      html.button(
        [attribute.type_("button"), event.on_click(on_back)],
        [text("← Back to repositories / プロジェクト一覧に戻る")],
      ),
      text(" "),
      html.button(
        [
          attribute.type_("button"),
          attribute.disabled(is_loading),
          event.on_click(on_force_refresh),
        ],
        [text("Force refresh / 最新コミット再取得")],
      ),
    ]),
    html.h2([], [
      text("Project: " <> repo_commits.project_name <> " (commits: " <> count_label <> ")"),
    ]),
    html.p([], [
      text("HEAD: "),
      case string.trim(repo_commits.head_oid) {
        "" -> text("None (empty repository)")
        head -> html.code([], [text(head)])
      },
      text(" | Default branch: "),
      html.code([], [text(repo_commits.default_branch)]),
      text(" | Cache status: "),
      case repo_commits.from_cache {
        True ->
          html.strong([], [text("[HIT: localStorage cache (0ms)]")])
        False ->
          html.span([], [text("[MISS: fetched fresh from GAS]")])
      },
    ]),
    case repo_commits.error {
      "" -> text("")
      err ->
        html.div([attribute.attribute("role", "alert")], [
          html.p([], [html.strong([], [text("Error: ")]), text(err)]),
        ])
    },
    case repo_commits.commits {
      [] ->
        html.div([], [
          html.p([], [
            text(
              "このリポジトリにはまだコミットがありません。(No commits yet in this repository. Push your first commit using git push!)",
            ),
          ]),
        ])
      commits -> view_commits_with_graph(commits)
    },
  ])
}

fn view_commits_with_graph(commits: List(Commit)) -> Element(msg) {
  html.div([], [
    html.table([attribute.attribute("border", "1")], [
      html.thead([], [
        html.tr([], [
          html.th([], [text("Graph (git log --graph)")]),
          html.th([], [text("Commit / Summary")]),
          html.th([], [text("Author")]),
          html.th([], [text("Date (Unix timestamp)")]),
          html.th([], [text("Hash / Parents")]),
        ]),
      ]),
      html.tbody([], [
        html.tr([], [
          html.td(
            [
              attribute.attribute("valign", "top"),
              attribute.attribute("style", "padding: 0; vertical-align: top;"),
            ],
            [graph.render_svg_graph(commits)],
          ),
          html.td(
            [
              attribute.attribute("colspan", "4"),
              attribute.attribute("valign", "top"),
              attribute.attribute("style", "padding: 0; vertical-align: top;"),
            ],
            [
              html.table(
                [
                  attribute.attribute("border", "0"),
                  attribute.attribute("width", "100%"),
                ],
                [
                  html.tbody(
                    [],
                    list.map(commits, fn(commit) { view_commit_row(commit) }),
                  ),
                ],
              ),
            ],
          ),
        ]),
      ]),
    ]),
  ])
}

fn view_commit_row(commit: Commit) -> Element(msg) {
  html.tr(
    [
      attribute.attribute(
        "style",
        "height: 36px; min-height: 36px; vertical-align: middle;",
      ),
    ],
    [
      html.td([], [
        view_ref_decorations(commit.refs),
        html.strong([], [text(commit.summary)]),
      ]),
      html.td([], [
        text(commit.author_name <> " <" <> commit.author_email <> ">"),
      ]),
      html.td([], [text(int.to_string(commit.timestamp))]),
      html.td([], [
        html.code([], [text(commit.short_oid)]),
        case commit.parents {
          [] -> text("")
          parents ->
            text(" (parents: " <> string.join(list.map(parents, fn(p) { string.slice(p, 0, 7) }), ", ") <> ")")
        },
      ]),
    ],
  )
}

fn view_ref_decorations(refs: List(String)) -> Element(msg) {
  case refs {
    [] -> text("")
    _ ->
      html.span([], [
        list.map(refs, fn(r) {
          html.span(
            [
              attribute.attribute(
                "style",
                "display: inline-block; padding: 1px 4px; margin-right: 4px; border: 1px solid #ccc; font-size: 0.85em;",
              ),
            ],
            [text(r)],
          )
        })
        |> element.fragment,
        text(" "),
      ])
  }
}
