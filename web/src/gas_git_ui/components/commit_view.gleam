//// Commit history, same-page Graph/Log switcher, 100-commits-per-page pagination,
//// and Commit Inspector component (file changes diff + interactive directory/file tree browser at any commit).

import gas_git_ui/graph
import gas_git_ui/types.{
  type Commit, type CommitDetail, type CommitFileChange, type CommitInspectorTab,
  type CommitTreeEntry, type HistoryTab, type RepoCommits, InspectorChanges,
  InspectorDirectoryTree, TabCommitLog, TabGraph,
}
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event

pub const commits_per_page = 100

pub fn view_commit_history(
  repo_commits: RepoCommits,
  commit_page: Int,
  history_tab: HistoryTab,
  selected_commit_oid: Option(String),
  active_commit_detail: Option(CommitDetail),
  is_loading: Bool,
  is_detail_loading: Bool,
  inspector_tab: CommitInspectorTab,
  current_dir: String,
  selected_file_path: Option(String),
  on_back: msg,
  on_force_refresh: msg,
  on_switch_history_tab: fn(HistoryTab) -> msg,
  on_select_page: fn(Int) -> msg,
  on_select_commit: fn(String) -> msg,
  on_close_inspector: msg,
  on_switch_inspector_tab: fn(CommitInspectorTab) -> msg,
  on_navigate_dir: fn(String) -> msg,
  on_select_file: fn(Option(String)) -> msg,
  on_open_file_in_tree: fn(String) -> msg,
) -> Element(msg) {
  let commit_count = list.length(repo_commits.commits)
  let count_label = int.to_string(commit_count)
  let total_pages = case commit_count <= 0 {
    True -> 1
    False -> { commit_count + commits_per_page - 1 } / commits_per_page
  }
  let safe_page = int.min(int.max(1, commit_page), total_pages)
  let start_idx = { safe_page - 1 } * commits_per_page
  let page_commits =
    repo_commits.commits
    |> list.drop(start_idx)
    |> list.take(commits_per_page)
  let end_idx = start_idx + list.length(page_commits)

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
      text(
        "Project: "
        <> repo_commits.project_name
        <> " (commits: "
        <> count_label
        <> " — Page "
        <> int.to_string(safe_page)
        <> "/"
        <> int.to_string(total_pages)
        <> ")",
      ),
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
          html.strong([], [
            text("[HIT: " <> repo_commits.cache_backend <> " (0ms)]"),
          ])
        False ->
          html.span([], [
            text("[MISS: fetched fresh from " <> repo_commits.cache_backend <> "]"),
          ])
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
      _ ->
        html.div([], [
          view_history_mode_switcher(history_tab, on_switch_history_tab),
          view_commit_pagination_bar(
            safe_page,
            total_pages,
            start_idx + 1,
            end_idx,
            commit_count,
            on_select_page,
          ),
          case history_tab {
            TabGraph ->
              html.div([], [
                html.p([], [
                  text(
                    "ツリー内の各コミットカードまたはノードをクリックすると、そのコミットの変更差分（Diff）と当時のディレクトリ・ファイル状態を確認できます。",
                  ),
                ]),
                html.div(
                  [
                    attribute.attribute(
                      "style",
                      "overflow-x: auto; padding: 8px 0; margin-bottom: 16px;",
                    ),
                  ],
                  [
                    graph.render_svg_graph(
                      page_commits,
                      selected_commit_oid,
                      on_select_commit,
                    ),
                  ],
                ),
              ])
            TabCommitLog ->
              view_commit_log_table(
                page_commits,
                selected_commit_oid,
                on_select_commit,
              )
          },
          case total_pages > 1 {
            True ->
              view_commit_pagination_bar(
                safe_page,
                total_pages,
                start_idx + 1,
                end_idx,
                commit_count,
                on_select_page,
              )
            False -> text("")
          },
          view_commit_inspector_panel(
            selected_commit_oid,
            active_commit_detail,
            is_detail_loading,
            inspector_tab,
            current_dir,
            selected_file_path,
            on_select_commit,
            on_close_inspector,
            on_switch_inspector_tab,
            on_navigate_dir,
            on_select_file,
            on_open_file_in_tree,
          ),
        ])
    },
  ])
}

fn view_commit_pagination_bar(
  current_page: Int,
  total_pages: Int,
  range_start: Int,
  range_end: Int,
  total_commits: Int,
  on_select_page: fn(Int) -> msg,
) -> Element(msg) {
  let page_numbers = build_page_range(1, total_pages, [])

  html.div(
    [
      attribute.attribute(
        "style",
        "margin: 10px 0; padding: 8px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px;",
      ),
    ],
    [
      html.div([attribute.attribute("style", "margin-bottom: 6px;")], [
        html.strong([], [
          text(
            "Showing commits "
            <> int.to_string(range_start)
            <> "–"
            <> int.to_string(range_end)
            <> " of "
            <> int.to_string(total_commits)
            <> " (Page "
            <> int.to_string(current_page)
            <> " / "
            <> int.to_string(total_pages)
            <> " · "
            <> int.to_string(commits_per_page)
            <> " commits/page, newest first / 最新コミット順)",
          ),
        ]),
      ]),
      case total_pages > 1 {
        False -> text("")
        True ->
          html.div(
            [],
            list.flatten([
              [
                html.button(
                  [
                    attribute.type_("button"),
                    attribute.disabled(current_page <= 1),
                    event.on_click(on_select_page(1)),
                  ],
                  [text("« First (1)")],
                ),
                text(" "),
                html.button(
                  [
                    attribute.type_("button"),
                    attribute.disabled(current_page <= 1),
                    event.on_click(on_select_page(current_page - 1)),
                  ],
                  [text("‹ Newer 100 / 前の100件 (新しい順)")],
                ),
                text(" "),
              ],
              list.map(page_numbers, fn(p) {
                let is_curr = p == current_page
                html.span([], [
                  html.button(
                    [
                      attribute.type_("button"),
                      attribute.disabled(is_curr),
                      event.on_click(on_select_page(p)),
                    ],
                    [
                      text(case is_curr {
                        True -> "[" <> int.to_string(p) <> "]"
                        False -> int.to_string(p)
                      }),
                    ],
                  ),
                  text(" "),
                ])
              }),
              [
                html.button(
                  [
                    attribute.type_("button"),
                    attribute.disabled(current_page >= total_pages),
                    event.on_click(on_select_page(current_page + 1)),
                  ],
                  [text("Older 100 / 次の100件 (古い順) ›")],
                ),
                text(" "),
                html.button(
                  [
                    attribute.type_("button"),
                    attribute.disabled(current_page >= total_pages),
                    event.on_click(on_select_page(total_pages)),
                  ],
                  [text("Last (" <> int.to_string(total_pages) <> ") »")],
                ),
              ],
            ]),
          )
      },
    ],
  )
}

fn build_page_range(curr: Int, max_p: Int, acc: List(Int)) -> List(Int) {
  case curr > max_p {
    True -> list.reverse(acc)
    False -> build_page_range(curr + 1, max_p, [curr, ..acc])
  }
}

fn view_history_mode_switcher(
  active_tab: HistoryTab,
  on_switch: fn(HistoryTab) -> msg,
) -> Element(msg) {
  let is_graph = case active_tab {
    TabGraph -> True
    TabCommitLog -> False
  }

  html.div(
    [
      attribute.attribute(
        "style",
        "margin: 12px 0; padding: 8px; border-bottom: 2px solid #cbd5e1;",
      ),
    ],
    [
      html.strong([], [text("View Mode / 表示切替: ")]),
      html.button(
        [
          attribute.type_("button"),
          attribute.disabled(is_graph),
          event.on_click(on_switch(TabGraph)),
        ],
        [
          text(case is_graph {
            True -> "● Graph View / グラフ表示 (Fossil SVG Tree)"
            False -> "○ Graph View / グラフ表示 (Fossil SVG Tree)"
          }),
        ],
      ),
      text(" "),
      html.button(
        [
          attribute.type_("button"),
          attribute.disabled(case is_graph {
            True -> False
            False -> True
          }),
          event.on_click(on_switch(TabCommitLog)),
        ],
        [
          text(case is_graph {
            True -> "○ Commit Log / コミットログ一覧"
            False -> "● Commit Log / コミットログ一覧"
          }),
        ],
      ),
    ],
  )
}

fn view_commit_log_table(
  commits: List(Commit),
  selected_commit_oid: Option(String),
  on_select_commit: fn(String) -> msg,
) -> Element(msg) {
  html.div([], [
    html.p([], [
      text(
        "各行の「Inspect / 変更・ファイル確認」ボタンを押すと、そのコミットの変更内容（Diff）とディレクトリ状態を表示します。",
      ),
    ]),
    html.table([attribute.attribute("border", "1")], [
      html.thead([], [
        html.tr([], [
          html.th([], [text("Date (UTC)")]),
          html.th([], [text("Hash")]),
          html.th([], [text("Refs / Branches")]),
          html.th([], [text("Commit Summary")]),
          html.th([], [text("Author")]),
          html.th([], [text("Parents")]),
          html.th([], [text("Inspect / 詳細・ツリー")]),
        ]),
      ]),
      html.tbody(
        [],
        list.map(commits, fn(commit) {
          view_commit_row(commit, selected_commit_oid, on_select_commit)
        }),
      ),
    ]),
  ])
}

fn view_commit_row(
  commit: Commit,
  selected_commit_oid: Option(String),
  on_select_commit: fn(String) -> msg,
) -> Element(msg) {
  let is_selected = case selected_commit_oid {
    Some(sel) -> sel == commit.oid
    None -> False
  }
  let row_style = case is_selected {
    True -> "background-color: #dbeafe;"
    False -> ""
  }

  html.tr([attribute.attribute("style", row_style)], [
    html.td([], [
      html.code([], [text(types.format_timestamp(commit.timestamp))]),
    ]),
    html.td([], [html.code([], [text(commit.short_oid)])]),
    html.td([], [view_ref_decorations(commit.refs)]),
    html.td([], [html.strong([], [text(commit.summary)])]),
    html.td([], [
      text(commit.author_name <> " <" <> commit.author_email <> ">"),
    ]),
    html.td([], [
      case commit.parents {
        [] -> text("root")
        parents ->
          html.code([], [
            text(
              string.join(
                list.map(parents, fn(p) { string.slice(p, 0, 7) }),
                ", ",
              ),
            ),
          ])
      },
    ]),
    html.td([], [
      html.button(
        [
          attribute.type_("button"),
          event.on_click(on_select_commit(commit.oid)),
        ],
        [
          text(case is_selected {
            True -> "★ Inspecting / 表示中"
            False -> "Inspect / 変更・ファイル確認"
          }),
        ],
      ),
    ]),
  ])
}

fn view_ref_decorations(refs: List(String)) -> Element(msg) {
  case refs {
    [] -> text("-")
    _ ->
      html.span(
        [],
        list.map(refs, fn(r) {
          html.span(
            [
              attribute.attribute(
                "style",
                "display: inline-block; padding: 1px 6px; margin-right: 4px; border: 1px solid #0969da; border-radius: 4px; font-size: 0.85em;",
              ),
            ],
            [text(r)],
          )
        }),
      )
  }
}

fn view_commit_inspector_panel(
  selected_commit_oid: Option(String),
  active_commit_detail: Option(CommitDetail),
  is_detail_loading: Bool,
  inspector_tab: CommitInspectorTab,
  current_dir: String,
  selected_file_path: Option(String),
  on_select_commit: fn(String) -> msg,
  on_close_inspector: msg,
  on_switch_inspector_tab: fn(CommitInspectorTab) -> msg,
  on_navigate_dir: fn(String) -> msg,
  on_select_file: fn(Option(String)) -> msg,
  on_open_file_in_tree: fn(String) -> msg,
) -> Element(msg) {
  case selected_commit_oid {
    None -> text("")
    Some(target_oid) ->
      html.section(
        [
          attribute.attribute(
            "style",
            "margin-top: 20px; padding: 14px; border: 2px solid #0969da; border-radius: 6px; background: #f8fafc;",
          ),
        ],
        [
          case is_detail_loading, active_commit_detail {
            True, _ ->
              html.div([], [
                html.p([], [
                  html.strong([], [
                    text(
                      "Loading commit detail & directory snapshot for "
                      <> string.slice(target_oid, 0, 7)
                      <> "...",
                    ),
                  ]),
                ]),
              ])
            False, None ->
              html.div([], [
                html.p([], [text("No commit detail loaded.")]),
              ])
            False, Some(detail) ->
              view_loaded_commit_detail(
                detail,
                inspector_tab,
                current_dir,
                selected_file_path,
                on_select_commit,
                on_close_inspector,
                on_switch_inspector_tab,
                on_navigate_dir,
                on_select_file,
                on_open_file_in_tree,
              )
          },
        ],
      )
  }
}

fn view_loaded_commit_detail(
  detail: CommitDetail,
  inspector_tab: CommitInspectorTab,
  current_dir: String,
  selected_file_path: Option(String),
  on_select_commit: fn(String) -> msg,
  on_close_inspector: msg,
  on_switch_inspector_tab: fn(CommitInspectorTab) -> msg,
  on_navigate_dir: fn(String) -> msg,
  on_select_file: fn(Option(String)) -> msg,
  on_open_file_in_tree: fn(String) -> msg,
) -> Element(msg) {
  let change_count = int.to_string(list.length(detail.changes))
  let file_count =
    int.to_string(
      list.length(
        list.filter(detail.tree_entries, fn(e) { e.kind == "blob" }),
      ),
    )
  let is_changes_tab = case inspector_tab {
    InspectorChanges -> True
    InspectorDirectoryTree -> False
  }

  html.div([], [
    html.div([], [
      html.h3([attribute.attribute("style", "display: inline-block; margin: 0 12px 8px 0;")], [
        text("Commit Inspector: "),
        html.code([], [text(detail.short_oid)]),
        text(" — " <> detail.summary),
      ]),
      html.button(
        [attribute.type_("button"), event.on_click(on_close_inspector)],
        [text("Close / 閉じる")],
      ),
    ]),
    html.p([], [
      text("Full OID: "),
      html.code([], [text(detail.oid)]),
      text(" | Tree OID: "),
      html.code([], [text(string.slice(detail.tree_oid, 0, 10))]),
      text(" | Author: "),
      text(detail.author_name <> " <" <> detail.author_email <> ">"),
      text(" | Date: "),
      html.code([], [text(types.format_timestamp(detail.timestamp))]),
      text(" | Cache: "),
      case detail.from_cache {
        True ->
          html.strong([], [
            text("[HIT: " <> detail.cache_backend <> " (0ms)]"),
          ])
        False ->
          html.span([], [
            text("[MISS: fetched fresh from " <> detail.cache_backend <> "]"),
          ])
      },
    ]),
    case detail.parents {
      [] -> html.p([], [text("Parents: root commit (initial commit)")])
      parents ->
        html.p(
          [],
          list.append(
            [text("Parents (click to inspect parent commit): ")],
            list.map(parents, fn(p) {
              html.span([], [
                html.button(
                  [
                    attribute.type_("button"),
                    event.on_click(on_select_commit(p)),
                  ],
                  [text("→ " <> string.slice(p, 0, 7))],
                ),
                text(" "),
              ])
            }),
          ),
        )
    },
    case string.trim(detail.body) {
      "" -> text("")
      body_str ->
        case body_str == detail.summary {
          True -> text("")
          False ->
            html.pre(
              [
                attribute.attribute(
                  "style",
                  "padding: 8px; background: #fff; border: 1px solid #cbd5e1;",
                ),
              ],
              [html.code([], [text(body_str)])],
            )
        }
    },
    html.div(
      [
        attribute.attribute(
          "style",
          "margin: 12px 0; padding: 8px 0; border-bottom: 1px solid #cbd5e1;",
        ),
      ],
      [
        html.button(
          [
            attribute.type_("button"),
            attribute.disabled(is_changes_tab),
            event.on_click(on_switch_inspector_tab(InspectorChanges)),
          ],
          [
            text(
              case is_changes_tab {
                True -> "● "
                False -> "○ "
              }
              <> "Changes / 変更差分 ("
              <> change_count
              <> " files)",
            ),
          ],
        ),
        text(" "),
        html.button(
          [
            attribute.type_("button"),
            attribute.disabled(case is_changes_tab {
              True -> False
              False -> True
            }),
            event.on_click(on_switch_inspector_tab(InspectorDirectoryTree)),
          ],
          [
            text(
              case is_changes_tab {
                True -> "○ "
                False -> "● "
              }
              <> "Directory & Files at Commit / コミット時のディレクトリ状態 ("
              <> file_count
              <> " files)",
            ),
          ],
        ),
      ],
    ),
    case inspector_tab {
      InspectorChanges ->
        view_commit_changes_tab(detail.changes, on_open_file_in_tree)
      InspectorDirectoryTree ->
        view_commit_directory_tree_tab(
          detail.tree_entries,
          current_dir,
          selected_file_path,
          on_navigate_dir,
          on_select_file,
        )
    },
  ])
}

fn view_commit_changes_tab(
  changes: List(CommitFileChange),
  on_open_file_in_tree: fn(String) -> msg,
) -> Element(msg) {
  case changes {
    [] ->
      html.p([], [
        text("このコミットでのファイル変更はありません。(No file changes in this commit.)"),
      ])
    _ -> {
      let total_add =
        list.fold(changes, 0, fn(acc, ch) { acc + ch.additions })
      let total_del =
        list.fold(changes, 0, fn(acc, ch) { acc + ch.deletions })

      html.div([], [
        html.p([], [
          html.strong([], [
            text(int.to_string(list.length(changes)) <> " changed files"),
          ]),
          text(
            " (+"
            <> int.to_string(total_add)
            <> " additions, -"
            <> int.to_string(total_del)
            <> " deletions)",
          ),
        ]),
        html.div(
          [],
          list.map(changes, fn(ch) {
            view_single_file_change(ch, on_open_file_in_tree)
          }),
        ),
      ])
    }
  }
}

fn view_single_file_change(
  ch: CommitFileChange,
  on_open_file_in_tree: fn(String) -> msg,
) -> Element(msg) {
  let badge_label = case ch.status {
    "added" -> "[ADDED]"
    "deleted" -> "[DELETED]"
    _ -> "[MODIFIED]"
  }

  html.div(
    [
      attribute.attribute(
        "style",
        "margin-bottom: 14px; border: 1px solid #cbd5e1; border-radius: 4px; background: #ffffff;",
      ),
    ],
    [
      html.div(
        [
          attribute.attribute(
            "style",
            "padding: 6px 10px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1;",
          ),
        ],
        [
          html.strong([], [text(badge_label <> " ")]),
          html.code([], [text(ch.path)]),
          text(
            " (+"
            <> int.to_string(ch.additions)
            <> " / -"
            <> int.to_string(ch.deletions)
            <> ") ",
          ),
          case ch.status == "deleted" {
            True -> text("")
            False ->
              html.button(
                [
                  attribute.type_("button"),
                  event.on_click(on_open_file_in_tree(ch.path)),
                ],
                [text("View file at this commit / この時点のファイル全体を見る")],
              )
          },
        ],
      ),
      html.pre(
        [
          attribute.attribute(
            "style",
            "margin: 0; padding: 8px 10px; overflow-x: auto; font-size: 12.5px; line-height: 1.45;",
          ),
        ],
        [html.code([], [text(ch.patch)])],
      ),
    ],
  )
}

fn view_commit_directory_tree_tab(
  entries: List(CommitTreeEntry),
  current_dir: String,
  selected_file_path: Option(String),
  on_navigate_dir: fn(String) -> msg,
  on_select_file: fn(Option(String)) -> msg,
) -> Element(msg) {
  let dir_entries =
    list.filter(entries, fn(e) { e.parent_dir == current_dir })
  let subdirs = list.filter(dir_entries, fn(e) { e.kind == "tree" })
  let files = list.filter(dir_entries, fn(e) { e.kind == "blob" })
  let all_files = list.filter(entries, fn(e) { e.kind == "blob" })

  let parent_dir = types.parent_directory(current_dir)
  let current_dir_display = case current_dir {
    "" -> "/ (repository root)"
    d -> "/" <> d
  }

  html.div([], [
    html.div(
      [
        attribute.attribute(
          "style",
          "padding: 8px; background: #e2e8f0; border-radius: 4px; margin-bottom: 10px;",
        ),
      ],
      [
        html.strong([], [text("Current Directory / 現在のディレクトリ: ")]),
        html.code([], [text(current_dir_display)]),
        text(" "),
        html.button(
          [
            attribute.type_("button"),
            attribute.disabled(current_dir == ""),
            event.on_click(on_navigate_dir("")),
          ],
          [text("Root (/)")],
        ),
        text(" "),
        html.button(
          [
            attribute.type_("button"),
            attribute.disabled(current_dir == ""),
            event.on_click(on_navigate_dir(parent_dir)),
          ],
          [text("↑ Up to parent (..)")],
        ),
      ],
    ),
    html.table([attribute.attribute("border", "1"), attribute.attribute("width", "100%")], [
      html.thead([], [
        html.tr([], [
          html.th([], [text("Type")]),
          html.th([], [text("Name / Path")]),
          html.th([], [text("Size")]),
          html.th([], [text("Object OID")]),
          html.th([], [text("Action")]),
        ]),
      ]),
      html.tbody(
        [],
        list.append(
          list.map(subdirs, fn(d) {
            html.tr([], [
              html.td([], [html.strong([], [text("[DIR]")])]),
              html.td([], [html.code([], [text(d.name <> "/")])]),
              html.td([], [text("-")]),
              html.td([], [html.code([], [text(string.slice(d.oid, 0, 7))])]),
              html.td([], [
                html.button(
                  [
                    attribute.type_("button"),
                    event.on_click(on_navigate_dir(d.path)),
                  ],
                  [text("Open directory / フォルダを開く")],
                ),
              ]),
            ])
          }),
          list.map(files, fn(f) {
            let is_selected = case selected_file_path {
              Some(sel) -> sel == f.path
              None -> False
            }
            html.tr(
              [
                attribute.attribute(
                  "style",
                  case is_selected {
                    True -> "background-color: #dbeafe;"
                    False -> ""
                  },
                ),
              ],
              [
                html.td([], [text("[FILE]")]),
                html.td([], [html.code([], [text(f.name)])]),
                html.td([], [text(int.to_string(f.size) <> " B")]),
                html.td([], [html.code([], [text(string.slice(f.oid, 0, 7))])]),
                html.td([], [
                  html.button(
                    [
                      attribute.type_("button"),
                      event.on_click(on_select_file(Some(f.path))),
                    ],
                    [
                      text(case is_selected {
                        True -> "★ Viewing / 表示中"
                        False -> "View content / 内容を表示"
                      }),
                    ],
                  ),
                ]),
              ],
            )
          }),
        ),
      ),
    ]),
    // Quick jump across all files in commit
    html.details([attribute.attribute("style", "margin-top: 10px;")], [
      html.summary([attribute.attribute("style", "cursor: pointer;")], [
        text(
          "All files in this commit ("
          <> int.to_string(list.length(all_files))
          <> " files) / 全ファイル一覧から直接開く",
        ),
      ]),
      html.div(
        [attribute.attribute("style", "padding: 6px 0;")],
        list.map(all_files, fn(f) {
          html.span([], [
            html.button(
              [
                attribute.type_("button"),
                event.on_click(on_select_file(Some(f.path))),
              ],
              [text(f.path <> " (" <> int.to_string(f.size) <> " B)")],
            ),
            text(" "),
          ])
        }),
      ),
    ]),
    // Selected file content viewer
    case selected_file_path {
      None ->
        html.p([], [
          text("ファイルを選択すると、このコミット時点でのファイル内容がここに表示されます。"),
        ])
      Some(target_path) -> {
        let found =
          list.find(entries, fn(e) {
            e.kind == "blob" && e.path == target_path
          })
        case found {
          Error(Nil) ->
            html.p([], [
              text("File not found in this commit: " <> target_path),
            ])
          Ok(file_entry) ->
            html.div(
              [
                attribute.attribute(
                  "style",
                  "margin-top: 14px; border: 1px solid #0969da; border-radius: 4px; background: #ffffff;",
                ),
              ],
              [
                html.div(
                  [
                    attribute.attribute(
                      "style",
                      "padding: 6px 10px; background: #e0f2fe; border-bottom: 1px solid #0969da;",
                    ),
                  ],
                  [
                    html.strong([], [text("File: ")]),
                    html.code([], [text(file_entry.path)]),
                    text(
                      " ("
                      <> int.to_string(file_entry.size)
                      <> " bytes | blob OID: "
                      <> string.slice(file_entry.oid, 0, 10)
                      <> ") ",
                    ),
                    html.button(
                      [
                        attribute.type_("button"),
                        event.on_click(on_select_file(None)),
                      ],
                      [text("Close file / 閉じる")],
                    ),
                  ],
                ),
                html.pre(
                  [
                    attribute.attribute(
                      "style",
                      "margin: 0; padding: 10px; overflow-x: auto; font-size: 12.5px; line-height: 1.45;",
                    ),
                  ],
                  [html.code([], [text(file_entry.content)])],
                ),
              ],
            )
        }
      }
    },
  ])
}
