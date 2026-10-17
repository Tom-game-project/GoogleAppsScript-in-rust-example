//// New Git repository creation form UI component.

import gas_git_ui/types
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html
import lustre/event

pub fn view_create_repository_form(
  base_url: String,
  new_repo_name: String,
  new_repo_description: String,
  is_loading: Bool,
  on_name_input: fn(String) -> msg,
  on_description_input: fn(String) -> msg,
  on_submit: msg,
) -> Element(msg) {
  let preview_remote = types.format_remote_url(base_url, new_repo_name)

  html.section([], [
    html.h2([], [text("Create a new repository / 新規リポジトリ作成")]),
    html.p([], [
      text(
        "登録された Google Drive フォルダー内に空の Git リポジトリを作成します（サーバー側で勝手に初期コミットは生成しません）。",
      ),
    ]),
    html.div([], [
      html.label([], [
        text("Repository name (project_name): "),
        html.input([
          attribute.type_("text"),
          attribute.placeholder("my-project"),
          attribute.value(new_repo_name),
          event.on_input(on_name_input),
        ]),
        text(".git"),
      ]),
    ]),
    html.div([], [
      html.label([], [
        text("Description (optional): "),
        html.input([
          attribute.type_("text"),
          attribute.placeholder("Repository description"),
          attribute.value(new_repo_description),
          event.on_input(on_description_input),
        ]),
      ]),
    ]),
    html.p([], [
      text("Remote URL preview: "),
      html.code([], [text(preview_remote)]),
    ]),
    html.button(
      [
        attribute.type_("button"),
        attribute.disabled(is_loading),
        event.on_click(on_submit),
      ],
      [text("Create repository / リポジトリを作成")],
    ),
  ])
}
