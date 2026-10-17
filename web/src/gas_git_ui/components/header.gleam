//// Header and status/error banner UI components.

import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute
import lustre/element.{type Element, text}
import lustre/element/html

pub fn view_header(
  drive_folder_configured: Bool,
  drive_folder_id: String,
  drive_folder_url: String,
) -> Element(msg) {
  html.header([], [
    html.h1([], [text("GAS Git Server (gitoxide + Google Drive)")]),
    html.p([], [
      text("Google Drive Folder (GIT_DRIVE_FOLDER_ID): "),
      case drive_folder_configured {
        True ->
          html.span([], [
            html.code([], [text(drive_folder_id)]),
            text(" "),
            case string.trim(drive_folder_url) {
              "" -> text("")
              url ->
                html.a(
                  [attribute.href(url), attribute.target("_blank")],
                  [text("[Open in Google Drive]")],
                )
            },
          ])
        False ->
          html.strong([], [
            text(
              "未設定 (Not configured — set Script Property GIT_DRIVE_FOLDER_ID)",
            ),
          ])
      },
    ]),
  ])
}

pub fn view_banners(
  is_loading: Bool,
  message: Option(String),
  error: Option(String),
) -> Element(msg) {
  html.div([], [
    case is_loading {
      True -> html.p([], [text("Loading...")])
      False -> text("")
    },
    case message {
      Some(msg) ->
        html.div([attribute.attribute("role", "status")], [
          html.p([], [html.strong([], [text("OK: ")]), text(msg)]),
        ])
      None -> text("")
    },
    case error {
      Some(err) ->
        html.div([attribute.attribute("role", "alert")], [
          html.p([], [html.strong([], [text("Error: ")]), text(err)]),
        ])
      None -> text("")
    },
  ])
}
