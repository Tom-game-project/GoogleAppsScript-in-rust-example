//// Pure Gleam Git commit graph lane calculation and SVG generation.
////
//// Produces an interactive or visually rich SVG topological graph resembling
//// `git log --graph`, rendering branching and merge curves, commit nodes,
//// and multi-lane coloring without requiring any external JavaScript or npm libraries.

import gas_git_ui/types.{type Commit}
import gleam/dict.{type Dict}
import gleam/float
import gleam/int
import gleam/list
import lustre/attribute
import lustre/element.{type Element}

const row_height: Float = 36.0
const col_width: Float = 18.0
const margin_x: Float = 14.0
const margin_y: Float = 18.0

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
    to_x: Float,
    to_y: Float,
    color: String,
    is_curved: Bool,
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

        let next_lanes =
          update_lanes_for_commit(active_lanes, lane, commit.parents)

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
      list.filter_map(node.commit.parents, fn(parent_oid) {
        case dict.get(node_map, parent_oid) {
          Ok(#(_, p_lane, px, py, _)) -> {
            let is_curved = node.lane != p_lane
            Ok(
              GraphEdge(
                from_x: node.cx,
                from_y: node.cy,
                to_x: px,
                to_y: py,
                color: node.color,
                is_curved: is_curved,
              ),
            )
          }
          Error(Nil) -> {
            Ok(
              GraphEdge(
                from_x: node.cx,
                from_y: node.cy,
                to_x: node.cx,
                to_y: node.cy +. 18.0,
                color: node.color,
                is_curved: False,
              ),
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

fn find_lane_index(lanes: List(String), target: String, current: Int) -> Result(Int, Nil) {
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
    [p1] -> set_at(padded, lane_idx, p1)
    [p1, ..other_parents] -> {
      let l1 = set_at(padded, lane_idx, p1)
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

pub fn render_svg_graph(commits: List(Commit)) -> Element(msg) {
  let layout = compute_layout(commits)
  let count = list.length(commits)
  let total_height = float.max(60.0, margin_y *. 2.0 +. int.to_float(count) *. row_height)
  let total_width = float.max(50.0, margin_x *. 2.0 +. int.to_float(layout.max_lane + 1) *. col_width)

  let edge_elements =
    list.map(layout.edges, fn(edge) {
      case edge.is_curved {
        True -> {
          let mid_y = { edge.from_y +. edge.to_y } /. 2.0
          let d =
            "M "
            <> float.to_string(edge.from_x)
            <> " "
            <> float.to_string(edge.from_y)
            <> " C "
            <> float.to_string(edge.from_x)
            <> " "
            <> float.to_string(mid_y)
            <> ", "
            <> float.to_string(edge.to_x)
            <> " "
            <> float.to_string(mid_y)
            <> ", "
            <> float.to_string(edge.to_x)
            <> " "
            <> float.to_string(edge.to_y)
          element.element(
            "path",
            [
              attribute.attribute("d", d),
              attribute.attribute("fill", "none"),
              attribute.attribute("stroke", edge.color),
              attribute.attribute("stroke-width", "2.5"),
              attribute.attribute("stroke-linecap", "round"),
            ],
            [],
          )
        }
        False -> {
          element.element(
            "line",
            [
              attribute.attribute("x1", float.to_string(edge.from_x)),
              attribute.attribute("y1", float.to_string(edge.from_y)),
              attribute.attribute("x2", float.to_string(edge.to_x)),
              attribute.attribute("y2", float.to_string(edge.to_y)),
              attribute.attribute("stroke", edge.color),
              attribute.attribute("stroke-width", "2.5"),
              attribute.attribute("stroke-linecap", "round"),
            ],
            [],
          )
        }
      }
    })

  let node_elements =
    list.map(layout.nodes, fn(node) {
      let radius = case list.length(node.commit.parents) > 1 {
        True -> "5.5"
        False -> "4.5"
      }
      element.element(
        "circle",
        [
          attribute.attribute("cx", float.to_string(node.cx)),
          attribute.attribute("cy", float.to_string(node.cy)),
          attribute.attribute("r", radius),
          attribute.attribute("fill", node.color),
          attribute.attribute("stroke", "#ffffff"),
          attribute.attribute("stroke-width", "2"),
        ],
        [],
      )
    })

  element.element(
    "svg",
    [
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
        "display: block; overflow: visible; min-width: "
        <> float.to_string(total_width)
        <> "px;",
      ),
    ],
    list.append(edge_elements, node_elements),
  )
}
