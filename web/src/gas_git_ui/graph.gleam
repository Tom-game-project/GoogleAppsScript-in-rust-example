//// Pure Gleam Fossil-style Git commit tree layout and SVG generation.
////
//// Uses `lustre/element.namespaced("http://www.w3.org/2000/svg", ...)` so that
//// browsers instantiate genuine `SVGElement` nodes, rendering a Fossil SCM-style
//// vertical timeline tree with branch rails, upward arrowheads, orthogonal rounded
//// branch forks, dashed merge lines, horizontal leader lines, and interactive commit cards.

import gas_git_ui/types.{type Commit}
import gleam/dict.{type Dict}
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import lustre/attribute.{type Attribute}
import lustre/element.{type Element, text}
import lustre/event

const svg_ns: String = "http://www.w3.org/2000/svg"
const row_height: Float = 54.0
const col_width: Float = 26.0
const margin_x: Float = 26.0
const margin_y: Float = 34.0
const card_width: Float = 660.0

pub type GraphNode {
  GraphNode(
    commit: Commit,
    row: Int,
    lane: Int,
    cx: Float,
    cy: Float,
    color: String,
  )
}

pub type GraphEdge {
  GraphEdge(
    from_x: Float,
    from_y: Float,
    from_lane: Int,
    to_x: Float,
    to_y: Float,
    to_lane: Int,
    color: String,
    is_curved: Bool,
    is_merge: Bool,
  )
}

pub type GraphLayout {
  GraphLayout(
    nodes: List(GraphNode),
    edges: List(GraphEdge),
    max_lane: Int,
    total_rows: Int,
  )
}

fn svg_el(
  tag: String,
  attrs: List(Attribute(msg)),
  children: List(Element(msg)),
) -> Element(msg) {
  element.namespaced(svg_ns, tag, attrs, children)
}

pub fn lane_color(lane: Int) -> String {
  let colors = [
    "#0969da",
    "#1a7f37",
    "#8250df",
    "#cf222e",
    "#bc4c00",
    "#bf3989",
    "#0550ae",
  ]
  let idx = lane % list.length(colors)
  case list.drop(colors, idx) {
    [c, ..] -> c
    [] -> "#0969da"
  }
}

pub fn compute_layout(commits: List(Commit)) -> GraphLayout {
  let page_row_map: Dict(String, Int) =
    list.index_fold(commits, dict.new(), fn(d, c, idx) {
      dict.insert(d, c.oid, idx)
    })

  let #(nodes_rev, _) =
    list.index_fold(
      commits,
      #([], []),
      fn(acc, commit, row_idx) {
        let #(nodes_acc, active_lanes) = acc
        let lane = find_or_assign_lane(active_lanes, commit.oid)
        let cx = margin_x +. int.to_float(lane) *. col_width
        let cy = margin_y +. int.to_float(row_idx) *. row_height
        let color = lane_color(lane)

        let node =
          GraphNode(
            commit: commit,
            row: row_idx,
            lane: lane,
            cx: cx,
            cy: cy,
            color: color,
          )

        // Only reserve active lanes for parent commits that appear BELOW `row_idx`
        // on the current page. Off-page parents (which draw a short downward stub edge)
        // or out-of-order parents must not hold a zombie lane open for the rest of the page.
        let visible_below_parents =
          list.filter(commit.parents, fn(parent_oid) {
            case dict.get(page_row_map, parent_oid) {
              Ok(p_row) -> p_row > row_idx
              Error(Nil) -> False
            }
          })

        let next_lanes =
          update_lanes_for_commit(active_lanes, lane, visible_below_parents)

        #([node, ..nodes_acc], next_lanes)
      },
    )

  let nodes = list.reverse(nodes_rev)
  let node_map: Dict(String, #(Int, Int, Float, Float, String)) =
    list.fold(nodes, dict.new(), fn(d, n) {
      dict.insert(d, n.commit.oid, #(n.row, n.lane, n.cx, n.cy, n.color))
    })

  let edges =
    list.flat_map(nodes, fn(node) {
      list.index_map(node.commit.parents, fn(parent_oid, parent_idx) {
        let is_merge = parent_idx > 0
        case dict.get(node_map, parent_oid) {
          Ok(#(_, p_lane, px, py, p_color)) -> {
            let is_curved = node.lane != p_lane
            let edge_color = case is_merge {
              True -> p_color
              False -> node.color
            }
            GraphEdge(
              from_x: node.cx,
              from_y: node.cy,
              from_lane: node.lane,
              to_x: px,
              to_y: py,
              to_lane: p_lane,
              color: edge_color,
              is_curved: is_curved,
              is_merge: is_merge,
            )
          }
          Error(Nil) -> {
            GraphEdge(
              from_x: node.cx,
              from_y: node.cy,
              from_lane: node.lane,
              to_x: node.cx,
              to_y: node.cy +. 22.0,
              to_lane: node.lane,
              color: node.color,
              is_curved: False,
              is_merge: False,
            )
          }
        }
      })
    })

  let max_lane =
    list.fold(nodes, 0, fn(m, n) {
      case n.lane > m {
        True -> n.lane
        False -> m
      }
    })

  GraphLayout(
    nodes: nodes,
    edges: edges,
    max_lane: max_lane,
    total_rows: list.length(commits),
  )
}

fn find_or_assign_lane(lanes: List(String), oid: String) -> Int {
  case find_lane_index(lanes, oid, 0) {
    Ok(idx) -> idx
    Error(Nil) ->
      case find_lane_index(lanes, "", 0) {
        Ok(free_idx) -> free_idx
        Error(Nil) -> list.length(lanes)
      }
  }
}

fn find_lane_index(
  lanes: List(String),
  target: String,
  current: Int,
) -> Result(Int, Nil) {
  case lanes {
    [] -> Error(Nil)
    [head, ..tail] ->
      case head == target {
        True -> Ok(current)
        False -> find_lane_index(tail, target, current + 1)
      }
  }
}

fn update_lanes_for_commit(
  lanes: List(String),
  lane_idx: Int,
  parents: List(String),
) -> List(String) {
  let padded = pad_list(lanes, lane_idx + 1, "")

  case parents {
    [] -> set_at(padded, lane_idx, "")
    [p1] -> {
      case find_other_lane_index(padded, p1, lane_idx, 0) {
        Ok(_) -> set_at(padded, lane_idx, "")
        Error(Nil) -> set_at(padded, lane_idx, p1)
      }
    }
    [p1, ..other_parents] -> {
      let l1 = case find_other_lane_index(padded, p1, lane_idx, 0) {
        Ok(_) -> set_at(padded, lane_idx, "")
        Error(Nil) -> set_at(padded, lane_idx, p1)
      }
      list.fold(other_parents, l1, fn(acc, p) {
        case list.contains(acc, p) {
          True -> acc
          False ->
            case find_lane_index(acc, "", 0) {
              Ok(free_i) -> set_at(acc, free_i, p)
              Error(Nil) -> list.append(acc, [p])
            }
        }
      })
    }
  }
}

fn find_other_lane_index(
  lanes: List(String),
  target: String,
  ignore_idx: Int,
  current: Int,
) -> Result(Int, Nil) {
  case lanes {
    [] -> Error(Nil)
    [head, ..tail] ->
      case current != ignore_idx && head == target {
        True -> Ok(current)
        False -> find_other_lane_index(tail, target, ignore_idx, current + 1)
      }
  }
}

fn pad_list(lst: List(String), min_len: Int, pad_val: String) -> List(String) {
  let cur_len = list.length(lst)
  case cur_len >= min_len {
    True -> lst
    False -> {
      let needed = min_len - cur_len
      let padding = list.repeat(pad_val, needed)
      list.append(lst, padding)
    }
  }
}

fn set_at(lst: List(String), index: Int, val: String) -> List(String) {
  case lst, index {
    [], 0 -> [val]
    [], _ -> []
    [_, ..tail], 0 -> [val, ..tail]
    [head, ..tail], i -> [head, ..set_at(tail, i - 1, val)]
  }
}

fn render_upward_arrow(cx: Float, tip_y: Float, color: String) -> Element(msg) {
  let base_y = tip_y +. 7.0
  let left_x = cx -. 4.0
  let right_x = cx +. 4.0
  let points =
    float.to_string(cx)
    <> ","
    <> float.to_string(tip_y)
    <> " "
    <> float.to_string(left_x)
    <> ","
    <> float.to_string(base_y)
    <> " "
    <> float.to_string(right_x)
    <> ","
    <> float.to_string(base_y)

  svg_el(
    "polygon",
    [
      attribute.attribute("points", points),
      attribute.attribute("fill", color),
    ],
    [],
  )
}

fn has_head_ref(refs: List(String)) -> Bool {
  list.any(refs, fn(r) { string.starts_with(r, "HEAD") })
}

fn truncate_text(s: String, max_chars: Int) -> String {
  case string.length(s) > max_chars {
    True -> string.slice(s, 0, max_chars) <> "…"
    False -> s
  }
}

/// Render a Fossil SCM-style commit tree as a genuine namespaced SVG element.
/// Clicking any commit node or card dispatches `on_select_commit(commit.oid)`.
pub fn render_svg_graph(
  commits: List(Commit),
  selected_oid: Option(String),
  on_select_commit: fn(String) -> msg,
) -> Element(msg) {
  let layout = compute_layout(commits)
  let count = list.length(commits)
  let rail_area_width =
    float.max(
      76.0,
      margin_x +. int.to_float(layout.max_lane + 1) *. col_width +. 22.0,
    )
  let total_width = rail_area_width +. card_width +. 20.0
  let total_height =
    float.max(88.0, margin_y +. int.to_float(count) *. row_height +. 16.0)

  // 1. Root pedestals
  let root_pedestals =
    list.flat_map(layout.nodes, fn(node) {
      case node.commit.parents {
        [] -> {
          let stem_top = node.cy +. 6.0
          let stem_bot = node.cy +. 20.0
          [
            svg_el(
              "line",
              [
                attribute.attribute("x1", float.to_string(node.cx)),
                attribute.attribute("y1", float.to_string(stem_top)),
                attribute.attribute("x2", float.to_string(node.cx)),
                attribute.attribute("y2", float.to_string(stem_bot)),
                attribute.attribute("stroke", node.color),
                attribute.attribute("stroke-width", "2.5"),
                attribute.attribute("stroke-dasharray", "3,2"),
              ],
              [],
            ),
            svg_el(
              "line",
              [
                attribute.attribute("x1", float.to_string(node.cx -. 6.0)),
                attribute.attribute("y1", float.to_string(stem_bot)),
                attribute.attribute("x2", float.to_string(node.cx +. 6.0)),
                attribute.attribute("y2", float.to_string(stem_bot)),
                attribute.attribute("stroke", node.color),
                attribute.attribute("stroke-width", "2.5"),
                attribute.attribute("stroke-linecap", "round"),
              ],
              [],
            ),
          ]
        }
        _ -> []
      }
    })

  // 2. Edges (parent -> child rails with Fossil-style rounded orthogonal branch forks & upward arrows)
  let edge_elements =
    list.flat_map(layout.edges, fn(edge) {
      case edge.is_curved {
        False -> {
          let arrow_tip_y = edge.from_y +. 7.0
          let line_top_y = edge.from_y +. 11.0
          [
            svg_el(
              "line",
              [
                attribute.attribute("x1", float.to_string(edge.to_x)),
                attribute.attribute("y1", float.to_string(edge.to_y)),
                attribute.attribute("x2", float.to_string(edge.from_x)),
                attribute.attribute("y2", float.to_string(line_top_y)),
                attribute.attribute("stroke", edge.color),
                attribute.attribute("stroke-width", "2.5"),
                attribute.attribute("stroke-linecap", "round"),
              ],
              [],
            ),
            render_upward_arrow(edge.from_x, arrow_tip_y, edge.color),
          ]
        }
        True -> {
          case edge.is_merge {
            True -> {
              let mid_y = { edge.from_y +. edge.to_y } /. 2.0
              let d =
                "M "
                <> float.to_string(edge.to_x)
                <> " "
                <> float.to_string(edge.to_y)
                <> " C "
                <> float.to_string(edge.to_x)
                <> " "
                <> float.to_string(mid_y)
                <> ", "
                <> float.to_string(edge.from_x)
                <> " "
                <> float.to_string(mid_y)
                <> ", "
                <> float.to_string(edge.from_x)
                <> " "
                <> float.to_string(edge.from_y +. 7.0)
              [
                svg_el(
                  "path",
                  [
                    attribute.attribute("d", d),
                    attribute.attribute("fill", "none"),
                    attribute.attribute("stroke", edge.color),
                    attribute.attribute("stroke-width", "2.2"),
                    attribute.attribute("stroke-dasharray", "5,3"),
                    attribute.attribute("stroke-linecap", "round"),
                  ],
                  [],
                ),
              ]
            }
            False -> {
              let corner_r = 10.0
              let dir_x = case edge.from_x >. edge.to_x {
                True -> 1.0
                False -> -1.0
              }
              let bend_x = edge.from_x -. dir_x *. corner_r
              let bend_y = edge.to_y -. corner_r
              let line_top_y = edge.from_y +. 11.0
              let arrow_tip_y = edge.from_y +. 7.0
              let d =
                "M "
                <> float.to_string(edge.to_x)
                <> " "
                <> float.to_string(edge.to_y)
                <> " L "
                <> float.to_string(bend_x)
                <> " "
                <> float.to_string(edge.to_y)
                <> " Q "
                <> float.to_string(edge.from_x)
                <> " "
                <> float.to_string(edge.to_y)
                <> " "
                <> float.to_string(edge.from_x)
                <> " "
                <> float.to_string(bend_y)
                <> " L "
                <> float.to_string(edge.from_x)
                <> " "
                <> float.to_string(line_top_y)
              [
                svg_el(
                  "path",
                  [
                    attribute.attribute("d", d),
                    attribute.attribute("fill", "none"),
                    attribute.attribute("stroke", edge.color),
                    attribute.attribute("stroke-width", "2.5"),
                    attribute.attribute("stroke-linecap", "round"),
                  ],
                  [],
                ),
                render_upward_arrow(edge.from_x, arrow_tip_y, edge.color),
              ]
            }
          }
        }
      }
    })

  // 3. Nodes, horizontal leader connectors, and clickable Fossil-style inline commit cards
  let row_elements =
    list.map(layout.nodes, fn(node) {
      let is_head = has_head_ref(node.commit.refs)
      let is_selected = case selected_oid {
        Some(sel) -> sel == node.commit.oid
        None -> False
      }
      let is_merge = list.length(node.commit.parents) > 1
      let leader_x1 = node.cx +. 7.0
      let leader_x2 = rail_area_width -. 4.0
      let card_x = rail_area_width
      let card_y = node.cy -. 21.0
      let card_bg = case is_selected, is_head {
        True, _ -> "#dbeafe"
        False, True -> "#f0f9ff"
        False, False -> "#f8fafc"
      }
      let card_border = case is_selected, is_head {
        True, _ -> "#1d4ed8"
        False, True -> node.color
        False, False -> "#cbd5e1"
      }
      let card_stroke_w = case is_selected, is_head {
        True, _ -> "2.4"
        False, True -> "1.8"
        False, False -> "1.2"
      }

      let refs_badge_str = case node.commit.refs {
        [] -> ""
        refs -> " [" <> string.join(refs, ", ") <> "] "
      }
      let top_line_text =
        "["
        <> node.commit.short_oid
        <> "]"
        <> refs_badge_str
        <> " "
        <> truncate_text(node.commit.summary, 60)

      let parents_str = case node.commit.parents {
        [] -> "root"
        ps ->
          string.join(
            list.map(ps, fn(p) { string.slice(p, 0, 7) }),
            ", ",
          )
      }
      let bottom_line_text =
        "user: "
        <> node.commit.author_name
        <> " <"
        <> node.commit.author_email
        <> ">   |   "
        <> types.format_timestamp(node.commit.timestamp)
        <> "   |   parent: "
        <> parents_str
        <> "   [Click to inspect diff & files]"

      let node_circles = case is_head, is_merge {
        True, _ -> [
          svg_el(
            "circle",
            [
              attribute.attribute("cx", float.to_string(node.cx)),
              attribute.attribute("cy", float.to_string(node.cy)),
              attribute.attribute("r", "8.5"),
              attribute.attribute("fill", "#ffffff"),
              attribute.attribute("stroke", node.color),
              attribute.attribute("stroke-width", "2"),
            ],
            [],
          ),
          svg_el(
            "circle",
            [
              attribute.attribute("cx", float.to_string(node.cx)),
              attribute.attribute("cy", float.to_string(node.cy)),
              attribute.attribute("r", "5.0"),
              attribute.attribute("fill", node.color),
            ],
            [],
          ),
        ]
        False, True -> [
          svg_el(
            "circle",
            [
              attribute.attribute("cx", float.to_string(node.cx)),
              attribute.attribute("cy", float.to_string(node.cy)),
              attribute.attribute("r", "6.5"),
              attribute.attribute("fill", node.color),
              attribute.attribute("stroke", "#ffffff"),
              attribute.attribute("stroke-width", "2"),
            ],
            [],
          ),
          svg_el(
            "circle",
            [
              attribute.attribute("cx", float.to_string(node.cx)),
              attribute.attribute("cy", float.to_string(node.cy)),
              attribute.attribute("r", "2.3"),
              attribute.attribute("fill", "#ffffff"),
            ],
            [],
          ),
        ]
        False, False -> [
          svg_el(
            "circle",
            [
              attribute.attribute("cx", float.to_string(node.cx)),
              attribute.attribute("cy", float.to_string(node.cy)),
              attribute.attribute("r", "5.5"),
              attribute.attribute("fill", "#ffffff"),
              attribute.attribute("stroke", node.color),
              attribute.attribute("stroke-width", "3"),
            ],
            [],
          ),
        ]
      }

      svg_el(
        "g",
        [
          attribute.attribute("style", "cursor: pointer;"),
          event.on_click(on_select_commit(node.commit.oid)),
        ],
        list.append(
          [
            svg_el(
              "line",
              [
                attribute.attribute("x1", float.to_string(leader_x1)),
                attribute.attribute("y1", float.to_string(node.cy)),
                attribute.attribute("x2", float.to_string(leader_x2)),
                attribute.attribute("y2", float.to_string(node.cy)),
                attribute.attribute("stroke", "#94a3b8"),
                attribute.attribute("stroke-width", "1.4"),
                attribute.attribute("stroke-dasharray", "3,3"),
              ],
              [],
            ),
            svg_el(
              "rect",
              [
                attribute.attribute("x", float.to_string(card_x)),
                attribute.attribute("y", float.to_string(card_y)),
                attribute.attribute("width", float.to_string(card_width)),
                attribute.attribute("height", "42"),
                attribute.attribute("rx", "6"),
                attribute.attribute("fill", card_bg),
                attribute.attribute("stroke", card_border),
                attribute.attribute("stroke-width", card_stroke_w),
              ],
              [],
            ),
            svg_el(
              "rect",
              [
                attribute.attribute("x", float.to_string(card_x)),
                attribute.attribute("y", float.to_string(card_y)),
                attribute.attribute("width", "5"),
                attribute.attribute("height", "42"),
                attribute.attribute("rx", "2"),
                attribute.attribute("fill", node.color),
              ],
              [],
            ),
            svg_el(
              "text",
              [
                attribute.attribute("x", float.to_string(card_x +. 14.0)),
                attribute.attribute("y", float.to_string(node.cy -. 4.0)),
                attribute.attribute("fill", "#0f172a"),
                attribute.attribute(
                  "font-family",
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                ),
                attribute.attribute("font-size", "13"),
                attribute.attribute("font-weight", "600"),
              ],
              [text(top_line_text)],
            ),
            svg_el(
              "text",
              [
                attribute.attribute("x", float.to_string(card_x +. 14.0)),
                attribute.attribute("y", float.to_string(node.cy +. 14.0)),
                attribute.attribute("fill", "#475569"),
                attribute.attribute(
                  "font-family",
                  "system-ui, -apple-system, sans-serif",
                ),
                attribute.attribute("font-size", "11.5"),
              ],
              [text(bottom_line_text)],
            ),
          ],
          node_circles,
        ),
      )
    })

  let all_svg_children =
    list.flatten([root_pedestals, edge_elements, row_elements])

  svg_el(
    "svg",
    [
      attribute.attribute("xmlns", svg_ns),
      attribute.attribute("width", float.to_string(total_width)),
      attribute.attribute("height", float.to_string(total_height)),
      attribute.attribute(
        "viewBox",
        "0 0 "
        <> float.to_string(total_width)
        <> " "
        <> float.to_string(total_height),
      ),
      attribute.attribute(
        "style",
        "display: block; max-width: 100%; height: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;",
      ),
    ],
    all_svg_children,
  )
}
