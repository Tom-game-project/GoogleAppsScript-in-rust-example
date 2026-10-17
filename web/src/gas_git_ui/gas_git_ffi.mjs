// Pure Effect boundary FFI for `web/src/gas_git_ui/api.gleam`.
// Used exclusively inside `lustre/effect.from` to communicate with Google Apps Script
// (`google.script.run` in HtmlService or HTTP `?action=list_repos` / `?action=create_repo`).

import { toList } from "../gleam.mjs";
import { RepoSummary, ServerState } from "./types.mjs";

function detectDefaultBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec";
  }
  const href = window.location.href.split("?")[0].split("#")[0];
  const execIdx = href.indexOf("/exec");
  if (execIdx !== -1) {
    return href.slice(0, execIdx + 5);
  }
  const devIdx = href.indexOf("/dev");
  if (devIdx !== -1) {
    return href.slice(0, devIdx + 4);
  }
  return href.replace(/\/+$/, "");
}

function decodeServerState(rawPayload) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawRepos = Array.isArray(data?.repositories) ? data.repositories : [];
  const repoItems = rawRepos.map(
    (r) =>
      new RepoSummary(
        String(r?.name ?? ""),
        String(r?.folder_name ?? `${r?.name ?? ""}.git`),
        String(r?.folder_id ?? ""),
        String(r?.folder_url ?? ""),
        String(r?.description ?? ""),
        String(r?.default_branch ?? "refs/heads/main"),
        String(r?.head_oid ?? ""),
        Number(r?.branch_count ?? 0),
      ),
  );

  let baseUrl = String(data?.base_url ?? "");
  if (!baseUrl || baseUrl.includes("<DEPLOYMENT_ID>")) {
    const detected = detectDefaultBaseUrl();
    if (detected && !detected.includes("googleusercontent.com")) {
      baseUrl = detected;
    }
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

export function loadInitialOrRemoteState(onSuccess, onError) {
  try {
    if (
      typeof window !== "undefined" &&
      window.__GAS_GIT_INITIAL_STATE__ &&
      typeof window.__GAS_GIT_INITIAL_STATE__ === "object"
    ) {
      const initial = window.__GAS_GIT_INITIAL_STATE__;
      window.__GAS_GIT_INITIAL_STATE__ = null;
      onSuccess(decodeServerState(initial));
      return;
    }
  } catch (err) {
    onError(String(err));
    return;
  }
  fetchRepositories(onSuccess, onError);
}

export function fetchRepositories(onSuccess, onError) {
  if (
    typeof window !== "undefined" &&
    window.google &&
    window.google.script &&
    window.google.script.run
  ) {
    window.google.script.run
      .withSuccessHandler((res) => {
        try {
          onSuccess(decodeServerState(res));
        } catch (e) {
          onError(String(e));
        }
      })
      .withFailureHandler((err) => onError(String(err?.message ?? err)))
      .git_list_repos();
    return;
  }

  fetch("?action=list_repos", { headers: { Accept: "application/json" } })
    .then((resp) => resp.json())
    .then((json) => onSuccess(decodeServerState(json)))
    .catch((err) => onError(String(err)));
}

export function createRepository(projectName, description, onSuccess, onError) {
  if (
    typeof window !== "undefined" &&
    window.google &&
    window.google.script &&
    window.google.script.run
  ) {
    window.google.script.run
      .withSuccessHandler((res) => {
        try {
          onSuccess(decodeServerState(res));
        } catch (e) {
          onError(String(e));
        }
      })
      .withFailureHandler((err) => onError(String(err?.message ?? err)))
      .git_create_repo(projectName, description || undefined);
    return;
  }

  fetch("?action=create_repo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      action: "create_repo",
      project_name: projectName,
      description: description,
    }),
  })
    .then((resp) => resp.json())
    .then((json) => onSuccess(decodeServerState(json)))
    .catch((err) => onError(String(err)));
}
