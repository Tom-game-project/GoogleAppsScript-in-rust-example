#!/usr/bin/env node
/**
 * Bundles the Gleam + Lustre Web UI (`web/build/dev/javascript/gas_git_ui/gas_git_ui.mjs`
 * and all transitive `.mjs` modules) together with `web/index.html` into a single
 * self-contained `dist/index.html` file for Google Apps Script (`HtmlService`) delivery.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));
const require = createRequire(import.meta.url);

const webDir = path.join(__dirname, "web");
const gleamOutDir = path.join(webDir, "build", "dev", "javascript", "gas_git_ui");
const gleamEntryMjs = path.join(gleamOutDir, "gas_git_ui.mjs");
const templateHtmlPath = fs.existsSync(path.join(webDir, "index.html"))
  ? path.join(webDir, "index.html")
  : path.join(__dirname, "index.html");
const distDir = path.join(__dirname, "dist");
const outHtmlPath = path.join(distDir, "index.html");

/**
 * Bundle `gleamEntryMjs` using Webpack 5 if available in `node_modules/webpack`.
 */
async function bundleWithWebpack(entryPath, tempOutDir) {
  let webpack;
  try {
    webpack = require("webpack");
  } catch {
    try {
      webpack = require(path.join(__dirname, "node_modules", "webpack"));
    } catch {
      return null;
    }
  }

  const outFilename = "__gas_ui_bundle.js";
  const compiler = webpack({
    mode: "production",
    target: ["web", "es2020"],
    entry: entryPath,
    devtool: false,
    output: {
      path: tempOutDir,
      filename: outFilename,
    },
    resolve: {
      extensions: [".mjs", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false,
          },
        },
      ],
    },
  });

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      compiler.close(() => {
        if (err) {
          reject(err);
          return;
        }
        if (stats && stats.hasErrors()) {
          const info = stats.toJson({ errors: true });
          reject(new Error(info.errors.map((e) => e.message).join("\n")));
          return;
        }
        const bundledPath = path.join(tempOutDir, outFilename);
        const code = fs.readFileSync(bundledPath, "utf8");
        try {
          fs.unlinkSync(bundledPath);
        } catch {}
        resolve(code);
      });
    });
  });
}

/**
 * Pure Node.js ES module bundler fallback (zero external npm packages required).
 * Recursively resolves relative `.mjs` / `.js` imports produced by `gleam build --target javascript`
 * and packages them into a single self-contained module registry.
 */
function bundleEsModulesPure(entryFile) {
  const modules = new Map();

  function resolveImport(fromFile, spec) {
    const baseDir = path.dirname(fromFile);
    const candidate = path.resolve(baseDir, spec);
    for (const ext of ["", ".mjs", ".js"]) {
      const p = candidate + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    const indexMjs = path.join(candidate, "index.mjs");
    if (fs.existsSync(indexMjs)) return indexMjs;
    const indexJs = path.join(candidate, "index.js");
    if (fs.existsSync(indexJs)) return indexJs;
    throw new Error(`Cannot resolve import '${spec}' from '${fromFile}'`);
  }

  function transformModule(absPath) {
    if (modules.has(absPath)) return absPath;
    modules.set(absPath, "");

    const source = fs.readFileSync(absPath, "utf8");
    const importRegex =
      /import\s+(?:(?:\*\s+as\s+([a-zA-Z0-9_$]+)|(?:([a-zA-Z0-9_$]+)\s*,?\s*)?(?:\{([^}]+)\})?)\s+from\s+)?["']([^"']+)["'];?/g;
    const exportNamedRegex = /export\s+\{([^}]+)\};?/g;
    const exportDeclRegex =
      /export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([a-zA-Z0-9_$]+)/g;
    const exportDefaultDeclRegex =
      /export\s+default\s+(?:async\s+)?(?:function\*?|class)?\s*([a-zA-Z0-9_$]*)/;

    const deps = [];
    let match;
    while ((match = importRegex.exec(source)) !== null) {
      const spec = match[4];
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const depPath = resolveImport(absPath, spec);
        deps.push({ spec, resolved: depPath, raw: match[0], match });
      }
    }

    for (const d of deps) {
      transformModule(d.resolved);
    }

    let transformed = source;

    transformed = transformed.replace(
      importRegex,
      (fullMatch, starIdent, defaultIdent, namedList, spec) => {
        if (!spec.startsWith(".") && !spec.startsWith("/")) return fullMatch;
        const depPath = resolveImport(absPath, spec);
        const depId = JSON.stringify(depPath);

        const lines = [`const __dep_${Math.random().toString(36).slice(2)} = __require(${depId});`];
        const depVar = lines[0].split(" ")[1];

        if (starIdent) {
          lines.push(`const ${starIdent} = ${depVar};`);
        }
        if (defaultIdent) {
          lines.push(`const ${defaultIdent} = ${depVar}.default ?? ${depVar};`);
        }
        if (namedList) {
          const parts = namedList.split(",").map((s) => s.trim()).filter(Boolean);
          for (const part of parts) {
            const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim());
            const localName = local || imported;
            lines.push(`const ${localName} = ${depVar}[${JSON.stringify(imported)}];`);
          }
        }
        return lines.join("\n");
      },
    );

    const exportedDecls = [];
    transformed = transformed.replace(
      exportDeclRegex,
      (fullMatch, ident) => {
        exportedDecls.push(ident);
        return fullMatch.replace(/^export\s+/, "");
      },
    );

    transformed = transformed.replace(
      exportNamedRegex,
      (fullMatch, namedList) => {
        const parts = namedList.split(",").map((s) => s.trim()).filter(Boolean);
        const assigns = parts.map((part) => {
          const [local, exported] = part.split(/\s+as\s+/).map((s) => s.trim());
          const expName = exported || local;
          return `__exports[${JSON.stringify(expName)}] = ${local};`;
        });
        return assigns.join("\n");
      },
    );

    if (exportedDecls.length > 0) {
      const exportLines = exportedDecls.map(
        (ident) => `__exports[${JSON.stringify(ident)}] = ${ident};`,
      );
      transformed = `${transformed}\n${exportLines.join("\n")}\n`;
    }
    modules.set(absPath, transformed);
    return absPath;
  }

  const rootId = transformModule(entryFile);
  const registryEntries = [];
  for (const [modId, code] of modules.entries()) {
    registryEntries.push(
      `${JSON.stringify(modId)}: function(__exports, __require) {\n${code}\n}`,
    );
  }

  return `(function() {
  const __modules = {\n${registryEntries.join(",\n")}\n  };
  const __cache = {};
  function __require(id) {
    if (__cache[id]) return __cache[id];
    const exportsObj = {};
    __cache[id] = exportsObj;
    __modules[id](exportsObj, __require);
    return exportsObj;
  }
  __require(${JSON.stringify(rootId)});
})();`;
}

/**
 * Fallback pre-compiled bundle used only when `gleam` CLI has not been run yet
 * (so `make build-ui` and E2E tests work in environments without the Gleam compiler installed).
 */
function getFallbackBundleCode() {
  return `
    class CustomType {}
    class Ok extends CustomType { constructor(v) { super(); this[0] = v; } }
    class ErrorResult extends CustomType { constructor(e) { super(); this[0] = e; } }
    class List {
      static fromArray(arr, tail) {
        let t = tail || new Empty();
        for (let i = arr.length - 1; i >= 0; --i) t = new NonEmpty(arr[i], t);
        return t;
      }
      toArray() {
        const out = [];
        for (let cur = this; cur instanceof NonEmpty; cur = cur.tail) out.push(cur.head);
        return out;
      }
    }
    class Empty extends List {}
    class NonEmpty extends List { constructor(h, t) { super(); this.head = h; this.tail = t; } }
    const toList = (arr, tail) => List.fromArray(arr, tail);
    class Some extends CustomType { constructor(v) { super(); this[0] = v; } }
    class None extends CustomType {}

    const gleam_string = {
      trim: (s) => String(s ?? "").trim(),
      ends_with: (s, suf) => String(s ?? "").endsWith(suf),
      drop_end: (s, n) => String(s ?? "").slice(0, Math.max(0, String(s ?? "").length - n)),
      slice: (s, idx, len) => String(s ?? "").slice(idx, idx + len),
    };

    class RepoSummary extends CustomType {
      constructor(name, folder_name, folder_id, folder_url, description, default_branch, head_oid, branch_count) {
        super();
        Object.assign(this, { name, folder_name, folder_id, folder_url, description, default_branch, head_oid, branch_count });
      }
    }
    class ServerState extends CustomType {
      constructor(ok, drive_folder_configured, drive_folder_id, drive_folder_url, base_url, selected_project, repositories, message, error) {
        super();
        Object.assign(this, { ok, drive_folder_configured, drive_folder_id, drive_folder_url, base_url, selected_project, repositories, message, error });
      }
    }
    class Commit extends CustomType {
      constructor(oid, short_oid, parents, author_name, author_email, timestamp, summary, body, refs) {
        super();
        Object.assign(this, { oid, short_oid, parents, author_name, author_email, timestamp, summary, body, refs });
      }
    }
    class RepoCommits extends CustomType {
      constructor(ok, project_name, head_oid, default_branch, commits, from_cache, error) {
        super();
        Object.assign(this, { ok, project_name, head_oid, default_branch, commits, from_cache, error });
      }
    }

    function detectDefaultBaseUrl() {
      const href = window.location.href.split("?")[0].split("#")[0];
      const execIdx = href.indexOf("/exec");
      if (execIdx !== -1) return href.slice(0, execIdx + 5);
      const devIdx = href.indexOf("/dev");
      if (devIdx !== -1) return href.slice(0, devIdx + 4);
      return href.replace(/\\/+$/, "");
    }

    function decodeServerState(rawPayload) {
      const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
      const rawRepos = Array.isArray(data?.repositories) ? data.repositories : [];
      const repoItems = rawRepos.map((r) => new RepoSummary(
        String(r?.name ?? ""),
        String(r?.folder_name ?? \`\${r?.name ?? ""}.git\`),
        String(r?.folder_id ?? ""),
        String(r?.folder_url ?? ""),
        String(r?.description ?? ""),
        String(r?.default_branch ?? "refs/heads/main"),
        String(r?.head_oid ?? ""),
        Number(r?.branch_count ?? 0),
      ));
      let baseUrl = String(data?.base_url ?? "");
      if (!baseUrl || baseUrl.includes("<DEPLOYMENT_ID>")) {
        const detected = detectDefaultBaseUrl();
        if (detected && !detected.includes("googleusercontent.com")) baseUrl = detected;
      }
      return new ServerState(
        Boolean(data?.ok ?? true),
        Boolean(data?.drive_folder_configured ?? false),
        String(data?.drive_folder_id ?? ""),
        String(data?.drive_folder_url ?? ""),
        baseUrl || "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
        String(data?.selected_project ?? ""),
        toList(repoItems),
        String(data?.message ?? ""),
        String(data?.error ?? ""),
      );
    }

    function decodeRepoCommits(data, fromCache) {
      const rawCommits = Array.isArray(data?.commits) ? data.commits : [];
      const commits = rawCommits.map((c) => new Commit(
        String(c?.oid ?? ""),
        String(c?.short_oid ?? (c?.oid ?? "").slice(0, 7)),
        toList((c?.parents ?? []).map(String)),
        String(c?.author_name ?? "Unknown"),
        String(c?.author_email ?? ""),
        Number(c?.timestamp ?? 0),
        String(c?.summary ?? ""),
        String(c?.body ?? ""),
        toList((c?.refs ?? []).map(String)),
      ));
      return new RepoCommits(
        Boolean(data?.ok ?? true),
        String(data?.project_name ?? ""),
        String(data?.head_oid ?? ""),
        String(data?.default_branch ?? "refs/heads/main"),
        toList(commits),
        Boolean(fromCache),
        String(data?.error ?? ""),
      );
    }

    const effect = {
      none: () => ({ tasks: [] }),
      from: (task) => ({ tasks: [task] }),
    };
    const attribute = {
      id: (v) => ({ kind: "attr", name: "id", value: String(v) }),
      type_: (v) => ({ kind: "attr", name: "type", value: String(v) }),
      placeholder: (v) => ({ kind: "attr", name: "placeholder", value: String(v) }),
      value: (v) => ({ kind: "prop", name: "value", value: String(v) }),
      disabled: (b) => ({ kind: "prop", name: "disabled", value: Boolean(b) }),
      href: (v) => ({ kind: "attr", name: "href", value: String(v) }),
      target: (v) => ({ kind: "attr", name: "target", value: String(v) }),
      attribute: (n, v) => ({ kind: "attr", name: String(n), value: String(v) }),
    };
    const event = {
      on_input: (fn) => ({ kind: "event", name: "input", handler: (e) => fn(String(e.target?.value ?? "")) }),
      on_click: (msg) => ({ kind: "event", name: "click", handler: () => msg }),
    };
    const text = (c) => ({ kind: "text", content: String(c) });
    const el = (tag, attrs, children) => ({
      kind: "element",
      tag,
      attrs: attrs?.toArray ? attrs.toArray() : (attrs || []),
      children: children?.toArray ? children.toArray() : (children || []),
    });
    const html = {
      div: (a, c) => el("div", a, c),
      header: (a, c) => el("header", a, c),
      section: (a, c) => el("section", a, c),
      h1: (a, c) => el("h1", a, c),
      h2: (a, c) => el("h2", a, c),
      h3: (a, c) => el("h3", a, c),
      p: (a, c) => el("p", a, c),
      span: (a, c) => el("span", a, c),
      strong: (a, c) => el("strong", a, c),
      code: (a, c) => el("code", a, c),
      pre: (a, c) => el("pre", a, c),
      a: (a, c) => el("a", a, c),
      label: (a, c) => el("label", a, c),
      button: (a, c) => el("button", a, c),
      table: (a, c) => el("table", a, c),
      thead: (a, c) => el("thead", a, c),
      tbody: (a, c) => el("tbody", a, c),
      tr: (a, c) => el("tr", a, c),
      th: (a, c) => el("th", a, c),
      td: (a, c) => el("td", a, c),
      hr: (a) => el("hr", a, []),
      input: (a) => el("input", a, []),
    };

    const svgTags = new Set(["svg", "path", "circle", "line", "g", "rect", "polyline", "polygon"]);
    function renderVNode(vnode, dispatch) {
      if (vnode.kind === "text") return document.createTextNode(vnode.content);
      const isSvg = svgTags.has(vnode.tag);
      const dom = isSvg
        ? document.createElementNS("http://www.w3.org/2000/svg", vnode.tag)
        : document.createElement(vnode.tag);
      for (const attr of vnode.attrs) {
        if (attr.kind === "attr") dom.setAttribute(attr.name, attr.value);
        else if (attr.kind === "prop") dom[attr.name] = attr.value;
        else if (attr.kind === "event") dom.addEventListener(attr.name, (e) => dispatch(attr.handler(e)));
      }
      for (const child of vnode.children) dom.appendChild(renderVNode(child, dispatch));
      return dom;
    }

    const lustre = {
      application: (initFn, updateFn, viewFn) => ({ initFn, updateFn, viewFn }),
      start: (app, selector, flags) => {
        const container = document.querySelector(selector);
        if (!container) return new ErrorResult("Mount element not found");
        let currentModel;
        const runEffects = (eff) => {
          if (!eff || !Array.isArray(eff.tasks)) return;
          for (const task of eff.tasks) task(dispatch);
        };
        const mountView = () => {
          const vtree = app.viewFn(currentModel);
          container.innerHTML = "";
          container.appendChild(renderVNode(vtree, dispatch));
        };
        const dispatch = (msg) => {
          const [nextModel, nextEffect] = app.updateFn(currentModel, msg);
          currentModel = nextModel;
          mountView();
          runEffects(nextEffect);
        };
        const [initModel, initEffect] = app.initFn(flags);
        currentModel = initModel;
        mountView();
        runEffects(initEffect);
        return new Ok(dispatch);
      },
    };

    function normalize_repo_name(raw) {
      const t = gleam_string.trim(raw);
      return gleam_string.ends_with(t, ".git") ? gleam_string.drop_end(t, 4) : t;
    }
    function format_remote_url(base, proj) {
      const c = normalize_repo_name(proj) || "project_name";
      return \`gas::\${base}/\${c}.git\`;
    }

    function renderSvgGraph(commits) {
      const rowHeight = 36;
      const colWidth = 18;
      const marginX = 14;
      const marginY = 18;
      const colors = ["#0969da", "#1a7f37", "#8250df", "#cf222e", "#bc4c00", "#bf3989", "#0550ae"];

      const activeLanes = [];
      const nodeMap = new Map();
      const nodes = [];

      commits.forEach((c, row) => {
        let lane = activeLanes.indexOf(c.oid);
        if (lane === -1) {
          const free = activeLanes.indexOf("");
          lane = free === -1 ? activeLanes.length : free;
        }
        activeLanes[lane] = c.oid;

        const cx = marginX + lane * colWidth;
        const cy = marginY + row * rowHeight;
        const color = colors[lane % colors.length];

        const node = { commit: c, row, lane, cx, cy, color };
        nodes.push(node);
        nodeMap.set(c.oid, node);

        const parents = c.parents.toArray();
        if (parents.length === 0) {
          activeLanes[lane] = "";
        } else {
          activeLanes[lane] = parents[0];
          for (let pIdx = 1; pIdx < parents.length; pIdx++) {
            const p = parents[pIdx];
            if (!activeLanes.includes(p)) {
              const free = activeLanes.indexOf("");
              if (free === -1) activeLanes.push(p);
              else activeLanes[free] = p;
            }
          }
        }
      });

      const edges = [];
      nodes.forEach((n) => {
        const parents = n.commit.parents.toArray();
        parents.forEach((p) => {
          const pNode = nodeMap.get(p);
          if (pNode) {
            edges.push({
              x1: n.cx,
              y1: n.cy,
              x2: pNode.cx,
              y2: pNode.cy,
              curved: n.lane !== pNode.lane,
              color: n.color,
            });
          } else {
            edges.push({
              x1: n.cx,
              y1: n.cy,
              x2: n.cx,
              y2: n.cy + 18,
              curved: false,
              color: n.color,
            });
          }
        });
      });

      const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
      const totalWidth = Math.max(50, marginX * 2 + (maxLane + 1) * colWidth);
      const totalHeight = Math.max(60, marginY * 2 + commits.length * rowHeight);

      const edgeElements = edges.map((e) => {
        if (e.curved) {
          const midY = (e.y1 + e.y2) / 2;
          const d = \`M \${e.x1} \${e.y1} C \${e.x1} \${midY}, \${e.x2} \${midY}, \${e.x2} \${e.y2}\`;
          return el("path", [
            attribute.attribute("d", d),
            attribute.attribute("fill", "none"),
            attribute.attribute("stroke", e.color),
            attribute.attribute("stroke-width", "2.5"),
            attribute.attribute("stroke-linecap", "round"),
          ], []);
        }
        return el("line", [
          attribute.attribute("x1", String(e.x1)),
          attribute.attribute("y1", String(e.y1)),
          attribute.attribute("x2", String(e.x2)),
          attribute.attribute("y2", String(e.y2)),
          attribute.attribute("stroke", e.color),
          attribute.attribute("stroke-width", "2.5"),
          attribute.attribute("stroke-linecap", "round"),
        ], []);
      });

      const nodeElements = nodes.map((n) => {
        const r = n.commit.parents.toArray().length > 1 ? "5.5" : "4.5";
        return el("circle", [
          attribute.attribute("cx", String(n.cx)),
          attribute.attribute("cy", String(n.cy)),
          attribute.attribute("r", r),
          attribute.attribute("fill", n.color),
          attribute.attribute("stroke", "#ffffff"),
          attribute.attribute("stroke-width", "2"),
        ], []);
      });

      return el("svg", [
        attribute.attribute("width", String(totalWidth)),
        attribute.attribute("height", String(totalHeight)),
        attribute.attribute("viewBox", \`0 0 \${totalWidth} \${totalHeight}\`),
        attribute.attribute("style", \`display: block; overflow: visible; min-width: \${totalWidth}px;\`),
      ], [...edgeElements, ...nodeElements]);
    }

    function init() {
      const model = {
        drive_folder_configured: false,
        drive_folder_id: "",
        drive_folder_url: "",
        base_url: "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
        repositories: toList([]),
        selected_project: new None(),
        new_repo_name: "",
        new_repo_description: "",
        view_mode: "overview",
        active_commits: null,
        commit_page: 1,
        cached_commits: new Map(),
        is_loading: true,
        message: new None(),
        error: new None(),
      };
      const eff = effect.from((dispatch) => {
        if (window.__GAS_GIT_INITIAL_STATE__ && typeof window.__GAS_GIT_INITIAL_STATE__ === "object") {
          const initData = window.__GAS_GIT_INITIAL_STATE__;
          window.__GAS_GIT_INITIAL_STATE__ = null;
          dispatch({ type: "State", res: new Ok(decodeServerState(initData)) });
          return;
        }
        fetch("?action=list_repos", { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((j) => dispatch({ type: "State", res: new Ok(decodeServerState(j)) }))
          .catch((e) => dispatch({ type: "State", res: new ErrorResult(String(e)) }));
      });
      return [model, eff];
    }

    function saveCommitsToLocalCache(projectName, requestedHead, data) {
      if (!data?.ok || typeof window === "undefined" || !window.localStorage) return;
      try {
        const prefix = \`gas_git_commits_\${projectName}_\`;
        const keysToRemove = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) keysToRemove.push(k);
        }
        for (const k of keysToRemove) window.localStorage.removeItem(k);
        const actualHead = String(data?.head_oid ?? requestedHead ?? "").trim();
        const serialized = JSON.stringify(data);
        if (actualHead) window.localStorage.setItem(\`\${prefix}\${actualHead}\`, serialized);
        window.localStorage.setItem(\`gas_git_commits_latest_\${projectName}\`, serialized);
      } catch (_) {}
    }

    function loadCommitsFromLocalCache(projectName, cleanHead) {
      if (typeof window === "undefined" || !window.localStorage) return null;
      try {
        if (cleanHead) {
          const byHead = window.localStorage.getItem(\`gas_git_commits_\${projectName}_\${cleanHead}\`);
          if (byHead) return JSON.parse(byHead);
        }
        const latestRaw = window.localStorage.getItem(\`gas_git_commits_latest_\${projectName}\`);
        if (latestRaw) {
          const parsed = JSON.parse(latestRaw);
          const cachedHead = String(parsed?.head_oid ?? "").trim();
          if (!cleanHead || cachedHead === cleanHead) return parsed;
        }
      } catch (_) {}
      return null;
    }

    function fetchCommitsEffect(projectName, headOid, forceRefresh) {
      return effect.from((dispatch) => {
        const cleanHead = (headOid || "").trim();
        if (!forceRefresh) {
          const cached = loadCommitsFromLocalCache(projectName, cleanHead);
          if (cached) {
            dispatch({ type: "Commits", res: new Ok(decodeRepoCommits(cached, true)) });
            return;
          }
          if (!cleanHead) {
            dispatch({
              type: "Commits",
              res: new Ok(new RepoCommits(true, projectName, "", "refs/heads/main", toList([]), true, "")),
            });
            return;
          }
        }

        fetch("?action=get_commits&repo=" + encodeURIComponent(projectName), {
          headers: { Accept: "application/json" },
        })
          .then((r) => r.json())
          .then((data) => {
            saveCommitsToLocalCache(projectName, cleanHead, data);
            dispatch({ type: "Commits", res: new Ok(decodeRepoCommits(data, false)) });
          })
          .catch((e) => dispatch({ type: "Commits", res: new ErrorResult(String(e)) }));
      });
    }

    function update(model, msg) {
      if (msg.type === "State") {
        if (msg.res instanceof Ok) {
          const s = msg.res[0];
          return [{
            ...model,
            drive_folder_configured: s.drive_folder_configured,
            drive_folder_id: s.drive_folder_id,
            drive_folder_url: s.drive_folder_url,
            base_url: s.base_url,
            repositories: s.repositories,
            selected_project: s.selected_project ? new Some(s.selected_project) : model.selected_project,
            is_loading: false,
            message: s.message ? new Some(s.message) : new None(),
            error: s.error ? new Some(s.error) : new None(),
          }, effect.none()];
        }
        return [{ ...model, is_loading: false, error: new Some(msg.res[0]) }, effect.none()];
      }
      if (msg.type === "Name") return [{ ...model, new_repo_name: msg.val, error: new None() }, effect.none()];
      if (msg.type === "Desc") return [{ ...model, new_repo_description: msg.val }, effect.none()];
      if (msg.type === "Select") return [{ ...model, selected_project: msg.val }, effect.none()];
      if (msg.type === "Create") {
        const clean = normalize_repo_name(model.new_repo_name);
        if (!clean) return [{ ...model, error: new Some("Repository name is required") }, effect.none()];
        const desc = gleam_string.trim(model.new_repo_description);
        return [{ ...model, new_repo_name: "", new_repo_description: "", is_loading: true }, effect.from((dispatch) => {
          fetch("?action=create_repo", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ action: "create_repo", project_name: clean, description: desc }),
          })
            .then((r) => r.json())
            .then((j) => dispatch({ type: "State", res: new Ok(decodeServerState(j)) }))
            .catch((e) => dispatch({ type: "State", res: new ErrorResult(String(e)) }));
        })];
      }
      if (msg.type === "OpenCommits") {
        const cached = model.cached_commits.get(msg.project_name);
        if (cached && cached.head_oid === msg.head_oid) {
          const hitEntry = new RepoCommits(cached.ok, cached.project_name, cached.head_oid, cached.default_branch, cached.commits, true, cached.error);
          return [{
            ...model,
            view_mode: "commits",
            active_commits: hitEntry,
            is_loading: false,
            error: new None(),
          }, effect.none()];
        }
        return [{
          ...model,
          view_mode: "commits",
          active_commits: null,
          is_loading: true,
          error: new None(),
        }, fetchCommitsEffect(msg.project_name, msg.head_oid, false)];
      }
      if (msg.type === "Commits") {
        if (msg.res instanceof Ok) {
          const rc = msg.res[0];
          const cachedEntry = new RepoCommits(rc.ok, rc.project_name, rc.head_oid, rc.default_branch, rc.commits, true, rc.error);
          model.cached_commits.set(rc.project_name, cachedEntry);
          const updatedRepos = model.repositories.toArray().map((r) =>
            r.name === rc.project_name
              ? new RepoSummary(r.name, r.folder_name, r.folder_id, r.folder_url, r.description, rc.default_branch, rc.head_oid, r.branch_count)
              : r
          );
          return [{
            ...model,
            repositories: toList(updatedRepos),
            active_commits: rc,
            is_loading: false,
            error: new None(),
          }, effect.none()];
        }
        return [{ ...model, is_loading: false, error: new Some(msg.res[0]) }, effect.none()];
      }
      if (msg.type === "Back") {
        return [{ ...model, view_mode: "overview", is_loading: false }, effect.none()];
      }
      if (msg.type === "ForceRefreshCommits") {
        model.cached_commits.delete(msg.project_name);
        return [{ ...model, commit_page: 1, is_loading: true, error: new None() }, fetchCommitsEffect(msg.project_name, msg.head_oid, true)];
      }
      if (msg.type === "SelectCommitPage") {
        return [{ ...model, commit_page: Math.max(1, Number(msg.page) || 1) }, effect.none()];
      }
      return [model, effect.none()];
    }

    function view(model) {
      if (model.view_mode === "commits") {
        const rc = model.active_commits;
        if (!rc) {
          return html.div(toList([attribute.id("gas-git-web-ui")]), toList([
            html.button(toList([attribute.type_("button"), event.on_click({ type: "Back" })]), toList([text("← Back to repositories / プロジェクト一覧に戻る")])),
            html.p(toList([]), toList([text("Loading commit history and graph...")])),
          ]));
        }

        const COMMITS_PER_PAGE = 100;
        const allCommits = rc.commits.toArray();
        const totalCommits = allCommits.length;
        const totalPages = totalCommits <= 0 ? 1 : Math.ceil(totalCommits / COMMITS_PER_PAGE);
        const safePage = Math.min(Math.max(1, model.commit_page || 1), totalPages);
        const startIdx = (safePage - 1) * COMMITS_PER_PAGE;
        const commits = allCommits.slice(startIdx, startIdx + COMMITS_PER_PAGE);
        const rangeStart = totalCommits === 0 ? 0 : startIdx + 1;
        const rangeEnd = startIdx + commits.length;

        const renderPaginationBar = () => {
          if (totalCommits === 0) return text("");
          const pageButtons = [];
          for (let p = 1; p <= totalPages; p++) {
            const isCurr = p === safePage;
            pageButtons.push(
              html.button(toList([
                attribute.type_("button"),
                attribute.disabled(isCurr),
                event.on_click({ type: "SelectCommitPage", page: p }),
              ]), toList([text(isCurr ? "[" + p + "]" : String(p))])),
              text(" ")
            );
          }
          return html.div(toList([
            attribute.attribute("style", "margin: 10px 0; padding: 8px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px;"),
          ]), toList([
            html.div(toList([attribute.attribute("style", "margin-bottom: 6px;")]), toList([
              html.strong(toList([]), toList([
                text(\`Showing commits \${rangeStart}–\${rangeEnd} of \${totalCommits} (Page \${safePage} / \${totalPages} · \${COMMITS_PER_PAGE} commits/page, newest first / 最新コミット順)\`),
              ])),
            ])),
            totalPages > 1
              ? html.div(toList([]), toList([
                  html.button(toList([
                    attribute.type_("button"),
                    attribute.disabled(safePage <= 1),
                    event.on_click({ type: "SelectCommitPage", page: 1 }),
                  ]), toList([text("« First (1)")])),
                  text(" "),
                  html.button(toList([
                    attribute.type_("button"),
                    attribute.disabled(safePage <= 1),
                    event.on_click({ type: "SelectCommitPage", page: safePage - 1 }),
                  ]), toList([text("‹ Newer 100 / 前の100件 (新しい順)")])),
                  text(" "),
                  ...pageButtons,
                  html.button(toList([
                    attribute.type_("button"),
                    attribute.disabled(safePage >= totalPages),
                    event.on_click({ type: "SelectCommitPage", page: safePage + 1 }),
                  ]), toList([text("Older 100 / 次の100件 (古い順) ›")])),
                  text(" "),
                  html.button(toList([
                    attribute.type_("button"),
                    attribute.disabled(safePage >= totalPages),
                    event.on_click({ type: "SelectCommitPage", page: totalPages }),
                  ]), toList([text(\`Last (\${totalPages}) »\`)])),
                ]))
              : text(""),
          ]));
        };

        return html.div(toList([attribute.id("gas-git-web-ui")]), toList([
          html.section(toList([]), toList([
            html.div(toList([]), toList([
              html.button(toList([attribute.type_("button"), event.on_click({ type: "Back" })]), toList([text("← Back to repositories / プロジェクト一覧に戻る")])),
              text(" "),
              html.button(toList([
                attribute.type_("button"),
                attribute.disabled(model.is_loading),
                event.on_click({ type: "ForceRefreshCommits", project_name: rc.project_name, head_oid: rc.head_oid }),
              ]), toList([text("Force refresh / 最新コミット再取得")])),
            ])),
            html.h2(toList([]), toList([text(\`Project: \${rc.project_name} (commits: \${totalCommits} — Page \${safePage}/\${totalPages})\`)])),
            html.p(toList([]), toList([
              text("HEAD: "),
              rc.head_oid ? html.code(toList([]), toList([text(rc.head_oid)])) : text("None (empty repository)"),
              text(" | Default branch: "),
              html.code(toList([]), toList([text(rc.default_branch)])),
              text(" | Cache status: "),
              rc.from_cache
                ? html.strong(toList([]), toList([text("[HIT: localStorage cache (0ms)]")]))
                : html.span(toList([]), toList([text("[MISS: fetched fresh from GAS]")])),
            ])),
            renderPaginationBar(),
            totalCommits === 0
              ? html.p(toList([]), toList([text("No commits yet in this repository. Push your first commit using git push!")]))
              : html.table(toList([attribute.attribute("border", "1")]), toList([
                  html.thead(toList([]), toList([
                    html.tr(toList([]), toList([
                      html.th(toList([]), toList([text("Graph (git log --graph)")])),
                      html.th(toList([]), toList([text("Commit / Summary")])),
                      html.th(toList([]), toList([text("Author")])),
                      html.th(toList([]), toList([text("Date (Unix timestamp)")])),
                      html.th(toList([]), toList([text("Hash / Parents")])),
                    ])),
                  ])),
                  html.tbody(toList([]), toList([
                    html.tr(toList([]), toList([
                      html.td(toList([
                        attribute.attribute("valign", "top"),
                        attribute.attribute("style", "padding: 0; vertical-align: top;"),
                      ]), toList([renderSvgGraph(commits)])),
                      html.td(toList([
                        attribute.attribute("colspan", "4"),
                        attribute.attribute("valign", "top"),
                        attribute.attribute("style", "padding: 0; vertical-align: top;"),
                      ]), toList([
                        html.table(toList([
                          attribute.attribute("border", "0"),
                          attribute.attribute("width", "100%"),
                        ]), toList([
                          html.tbody(toList([]), toList(commits.map((c) => html.tr(toList([
                            attribute.attribute("style", "height: 36px; min-height: 36px; vertical-align: middle;"),
                          ]), toList([
                            html.td(toList([]), toList([
                              ...c.refs.toArray().map((r) => html.span(toList([
                                attribute.attribute("style", "display: inline-block; padding: 1px 4px; margin-right: 4px; border: 1px solid #ccc; font-size: 0.85em;"),
                              ]), toList([text(r)]))),
                              html.strong(toList([]), toList([text(c.summary)])),
                            ])),
                            html.td(toList([]), toList([text(\`\${c.author_name} <\${c.author_email}>\`)])),
                            html.td(toList([]), toList([text(String(c.timestamp))])),
                            html.td(toList([]), toList([
                              html.code(toList([]), toList([text(c.short_oid)])),
                              c.parents.toArray().length > 0
                                ? text(\` (parents: \${c.parents.toArray().map((p) => p.slice(0, 7)).join(", ")})\`)
                                : text(""),
                            ])),
                          ]))))),
                        ])),
                      ])),
                    ])),
                  ])),
                ])),
            totalPages > 1 ? renderPaginationBar() : text(""),
          ])),
        ]));
      }

      const repos = model.repositories.toArray();
      return html.div(toList([attribute.id("gas-git-web-ui")]), toList([
        html.header(toList([]), toList([
          html.h1(toList([]), toList([text("GAS Git Server (gitoxide + Google Drive)")])),
          html.p(toList([]), toList([
            text("Google Drive Folder (GIT_DRIVE_FOLDER_ID): "),
            model.drive_folder_configured
              ? html.span(toList([]), toList([
                  html.code(toList([]), toList([text(model.drive_folder_id)])),
                  text(" "),
                  model.drive_folder_url ? html.a(toList([
                    attribute.href(model.drive_folder_url),
                    attribute.target("_blank"),
                  ]), toList([text("[Open in Google Drive]")])) : text(""),
                ]))
              : html.strong(toList([]), toList([text("未設定 (Not configured — set Script Property GIT_DRIVE_FOLDER_ID)")])),
          ])),
        ])),
        html.section(toList([]), toList([
          html.h2(toList([]), toList([text("Create a new repository / 新規リポジトリ作成")])),
          html.input(toList([
            attribute.type_("text"),
            attribute.placeholder("my-project"),
            attribute.value(model.new_repo_name),
            event.on_input((v) => ({ type: "Name", val: v })),
          ])),
          text(" "),
          html.button(toList([attribute.type_("button"), event.on_click({ type: "Create" })]), toList([text("Create repository / 作成")])),
          html.p(toList([]), toList([
            text("Remote URL preview: "),
            html.code(toList([]), toList([text(format_remote_url(model.base_url, model.new_repo_name))])),
          ])),
        ])),
        html.hr(toList([])),
        html.section(toList([]), toList([
          html.h2(toList([]), toList([text(\`Repositories (\${repos.length}) / 既存 Git プロジェクト一覧\`)])) ,
          repos.length === 0
            ? html.p(toList([]), toList([text("No repositories found in Google Drive folder.")]))
            : html.table(toList([attribute.attribute("border", "1")]), toList([
                html.thead(toList([]), toList([
                  html.tr(toList([]), toList([
                    html.th(toList([]), toList([text("Repository")])),
                    html.th(toList([]), toList([text("Description")])),
                    html.th(toList([]), toList([text("Status / HEAD")])),
                    html.th(toList([]), toList([text("Branches")])),
                    html.th(toList([]), toList([text("Remote URL (git remote add)")])),
                    html.th(toList([]), toList([text("Actions")])),
                  ])),
                ])),
                html.tbody(toList([]), toList(repos.map((repo) => html.tr(toList([]), toList([
                  html.td(toList([]), toList([html.strong(toList([]), toList([text(repo.folder_name)]))])),
                  html.td(toList([]), toList([text(repo.description)])) ,
                  html.td(toList([]), toList([html.code(toList([]), toList([
                    text(repo.head_oid ? \`\${repo.default_branch} (\${repo.head_oid.slice(0, 7)})\` : "Empty repository (0 commits)")
                  ]))])),
                  html.td(toList([]), toList([text(String(repo.branch_count))])),
                  html.td(toList([]), toList([html.code(toList([]), toList([text(format_remote_url(model.base_url, repo.name))]))])),
                  html.td(toList([]), toList([
                    html.button(toList([
                      attribute.type_("button"),
                      event.on_click({ type: "OpenCommits", project_name: repo.name, head_oid: repo.head_oid }),
                    ]), toList([text("Graph & Log / グラフ・履歴")])),
                    text(" "),
                    html.button(toList([
                      attribute.type_("button"),
                      event.on_click({ type: "Select", val: new Some(repo.name) }),
                    ]), toList([text("Quick Setup / 使い方")])),
                  ])),
                ]))))),
              ])),
        ])),
      ]));
    }

    const app = lustre.application(init, update, view);
    lustre.start(app, "#app", null);
  `;
}

async function main() {
  let bundleCode = "";

  if (fs.existsSync(gleamEntryMjs)) {
    const tempEntryPath = path.join(gleamOutDir, "__gas_bundle_entry.mjs");
    fs.writeFileSync(
      tempEntryPath,
      `import { main } from "./gas_git_ui.mjs";\nif (document.readyState === "loading") {\n  document.addEventListener("DOMContentLoaded", () => main());\n} else {\n  main();\n}\n`,
      "utf8",
    );

    try {
      const webpackCode = await bundleWithWebpack(tempEntryPath, gleamOutDir);
      if (webpackCode) {
        console.log("[bundle_web_html] Bundled Gleam JS output with Webpack -> dist/index.html");
        bundleCode = webpackCode;
      } else {
        console.log("[bundle_web_html] Bundled Gleam JS output with pure ES module bundler -> dist/index.html");
        bundleCode = bundleEsModulesPure(tempEntryPath);
      }
    } finally {
      try {
        fs.unlinkSync(tempEntryPath);
      } catch {}
    }
  } else {
    console.log(
      "[bundle_web_html] web/build/dev/javascript not found; generating dist/index.html with fallback bundle",
    );
    bundleCode = getFallbackBundleCode();
  }

  const safeBundle = bundleCode.replace(/<\/(script|head|body)/gi, "<\\/$1");
  const rawHtml = fs.readFileSync(templateHtmlPath, "utf8");

  // Remove external `<script type="module" src="..."></script>` tag and inline the bundled script
  const withoutExternalScript = rawHtml.replace(
    /<script\b[^>]*\bsrc=["'][^"']*gas_git_ui\.mjs["'][^>]*>\s*<\/script>/gi,
    "",
  );

  const inlinedHtml = withoutExternalScript.includes("</body>")
    ? withoutExternalScript.replace(
        "</body>",
        () => `\t<script type="module">\n${safeBundle}\n\t</script>\n\t</body>`,
      )
    : `${withoutExternalScript}\n<script type="module">\n${safeBundle}\n</script>\n`;

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(outHtmlPath, inlinedHtml, "utf8");
  console.log(`[bundle_web_html] Wrote ${outHtmlPath} (${Buffer.byteLength(inlinedHtml, "utf8")} bytes)`);
}

main().catch((err) => {
  console.error("[bundle_web_html] Error:", err);
  process.exit(1);
});
