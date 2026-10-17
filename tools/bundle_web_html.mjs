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
      if (fs.existsSync(candidate + ext) && fs.statSync(candidate + ext).isFile()) {
        return candidate + ext;
      }
    }
    throw new Error(`Cannot resolve import '${spec}' from '${fromFile}'`);
  }

  function transformModule(filePath) {
    const absPath = path.resolve(filePath);
    if (modules.has(absPath)) {
      return absPath;
    }
    modules.set(absPath, ""); // cycle guard

    let src = fs.readFileSync(absPath, "utf8");
    const exportFooter = [];

    // Replace `import ... from "..."` with `__require("...")`
    src = src.replace(
      /^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/gm,
      (_match, clause, spec) => {
        const depPath = resolveImport(absPath, spec);
        transformModule(depPath);
        const depId = JSON.stringify(depPath);
        const trimmedClause = clause.trim();

        if (trimmedClause.startsWith("* as ")) {
          const ns = trimmedClause.slice(5).trim();
          return `const ${ns} = __require(${depId});`;
        }
        if (trimmedClause.startsWith("{") && trimmedClause.endsWith("}")) {
          const bindings = trimmedClause
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((b) => {
              const parts = b.split(/\s+as\s+/);
              return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : b;
            })
            .join(", ");
          return `const { ${bindings} } = __require(${depId});`;
        }
        if (trimmedClause.includes("{")) {
          const braceIdx = trimmedClause.indexOf("{");
          const defName = trimmedClause.slice(0, braceIdx).replace(/,$/, "").trim();
          const namedPart = trimmedClause.slice(braceIdx);
          const bindings = namedPart
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((b) => {
              const parts = b.split(/\s+as\s+/);
              return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : b;
            })
            .join(", ");
          return `const __dep_mod = __require(${depId}); const ${defName} = __dep_mod.default ?? __dep_mod; const { ${bindings} } = __dep_mod;`;
        }
        return `const __dep_def = __require(${depId}); const ${trimmedClause} = __dep_def.default ?? __dep_def;`;
      },
    );

    // Replace side-effect-only `import "..."`
    src = src.replace(/^\s*import\s+["']([^"']+)["']\s*;?/gm, (_match, spec) => {
      const depPath = resolveImport(absPath, spec);
      transformModule(depPath);
      return `__require(${JSON.stringify(depPath)});`;
    });

    // Replace `export * from "..."`
    src = src.replace(
      /^\s*export\s+\*\s+from\s+["']([^"']+)["']\s*;?/gm,
      (_match, spec) => {
        const depPath = resolveImport(absPath, spec);
        transformModule(depPath);
        return `Object.assign(__exports, __require(${JSON.stringify(depPath)}));`;
      },
    );

    // Replace `export { a, b as c } from "..."`
    src = src.replace(
      /^\s*export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;?/gm,
      (_match, listStr, spec) => {
        const depPath = resolveImport(absPath, spec);
        transformModule(depPath);
        const depId = JSON.stringify(depPath);
        const assigns = listStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((item) => {
            const parts = item.split(/\s+as\s+/);
            const orig = parts[0].trim();
            const exported = parts.length === 2 ? parts[1].trim() : orig;
            return `__exports.${exported} = __dep.${orig};`;
          })
          .join(" ");
        return `{ const __dep = __require(${depId}); ${assigns} }`;
      },
    );

    // Replace `export { a, b as c }`
    src = src.replace(/^\s*export\s*\{([^}]*)\}\s*;?/gm, (_match, listStr) => {
      return listStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const parts = item.split(/\s+as\s+/);
          const local = parts[0].trim();
          const exported = parts.length === 2 ? parts[1].trim() : local;
          return `__exports.${exported} = ${local};`;
        })
        .join("\n");
    });

    // Replace `export default ...`
    src = src.replace(/^\s*export\s+default\s+/gm, "__exports.default = ");

    // Replace `export function name` / `export class name` / `export const name` / `export let name`
    src = src.replace(
      /^\s*export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/gm,
      (_m, asyncKw, name) => {
        exportFooter.push(`__exports.${name} = ${name};`);
        return `${asyncKw || ""}function ${name}`;
      },
    );
    src = src.replace(/^\s*export\s+class\s+([A-Za-z0-9_$]+)/gm, (_m, name) => {
      exportFooter.push(`__exports.${name} = ${name};`);
      return `class ${name}`;
    });
    src = src.replace(/^\s*export\s+(const|let|var)\s+([A-Za-z0-9_$]+)/gm, (_m, kw, name) => {
      exportFooter.push(`__exports.${name} = ${name};`);
      return `${kw} ${name}`;
    });

    const finalModuleCode = `${src}\n${exportFooter.join("\n")}`;
    modules.set(absPath, finalModuleCode);
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
      attrs: attrs.toArray ? attrs.toArray() : attrs,
      children: children.toArray ? children.toArray() : children,
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

    function renderVNode(vnode, dispatch) {
      if (vnode.kind === "text") return document.createTextNode(vnode.content);
      const dom = document.createElement(vnode.tag);
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
      return [model, effect.none()];
    }

    function view(model) {
      const repos = model.repositories.toArray();
      return html.div(toList([attribute.id("gas-git-web-ui")]), toList([
        html.header(toList([]), toList([
          html.h1(toList([]), toList([text("GAS Git Server (gitoxide + Google Drive)")])),
        ])),
        html.section(toList([]), toList([
          html.h2(toList([]), toList([text("Create a new repository / 新規リポジトリ作成")])),
          html.input(toList([
            attribute.type_("text"),
            attribute.placeholder("my-project"),
            attribute.value(model.new_repo_name),
            event.on_input((v) => ({ type: "Name", val: v })),
          ])),
          html.p(toList([]), toList([
            text("Remote URL preview: "),
            html.code(toList([]), toList([text(format_remote_url(model.base_url, model.new_repo_name))])),
          ])),
          html.button(toList([attribute.type_("button"), event.on_click({ type: "Create" })]), toList([text("Create repository")])),
        ])),
        html.section(toList([]), toList([
          html.h2(toList([]), toList([text(\`Repositories (\${repos.length})\`)])),
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

  const safeBundle = bundleCode.replace(/<\/script>/gi, "<\\/script>");
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
