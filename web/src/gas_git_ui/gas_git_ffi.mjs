// Pure Effect boundary FFI for `web/src/gas_git_ui/api.gleam`.
// Used exclusively inside `lustre/effect.from` to communicate with Google Apps Script
// (`google.script.run` in HtmlService or HTTP `?action=list_repos` / `?action=create_repo` / `?action=get_commits`).
//
// Implements client-side commit caching keyed by `${project_name}:${head_oid}`
// using `localStorage` so repeat visits serve the commit DAG and history instantly.

import { toList } from "../gleam.mjs";
import { Commit, RepoCommits, RepoSummary, ServerState } from "./types.mjs";

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

function decodeRepoCommits(rawPayload, fromCache) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawCommits = Array.isArray(data?.commits) ? data.commits : [];
  const commitItems = rawCommits.map(
    (c) =>
      new Commit(
        String(c?.oid ?? ""),
        String(c?.short_oid ?? (c?.oid ? c.oid.slice(0, 7) : "")),
        toList(Array.isArray(c?.parents) ? c.parents.map(String) : []),
        String(c?.author_name ?? ""),
        String(c?.author_email ?? ""),
        Number(c?.timestamp ?? 0),
        String(c?.summary ?? ""),
        String(c?.body ?? ""),
        toList(Array.isArray(c?.refs) ? c.refs.map(String) : []),
      ),
  );

  return new RepoCommits(
    Boolean(data?.ok ?? true),
    String(data?.project_name ?? ""),
    String(data?.head_oid ?? ""),
    String(data?.default_branch ?? "refs/heads/main"),
    toList(commitItems),
    Boolean(fromCache),
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

export function fetchRepoCommits(projectName, headOid, forceRefresh, onSuccess, onError) {
  const cleanHead = (headOid || "").trim();

  // If the repository is empty (0 commits), return immediately without network call
  if (!cleanHead) {
    onSuccess(new RepoCommits(true, projectName, "", "refs/heads/main", toList([]), true, ""));
    return;
  }

  const cacheKey = `gas_git_commits_${projectName}_${cleanHead}`;

  // Check persistent localStorage cache if not explicitly force-refreshing
  if (!forceRefresh) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          onSuccess(decodeRepoCommits(parsed, true));
          return;
        }
      }
    } catch (_) {}
  }

  // Cache miss or force-refresh: query server
  if (
    typeof window !== "undefined" &&
    window.google &&
    window.google.script &&
    window.google.script.run
  ) {
    window.google.script.run
      .withSuccessHandler((res) => {
        try {
          const data = typeof res === "string" ? JSON.parse(res) : res;
          if (data?.ok && typeof window !== "undefined" && window.localStorage) {
            try {
              window.localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (_) {}
          }
          onSuccess(decodeRepoCommits(data, false));
        } catch (e) {
          onError(String(e));
        }
      })
      .withFailureHandler((err) => onError(String(err?.message ?? err)))
      .git_get_commits(projectName);
    return;
  }

  fetch("?action=get_commits&repo=" + encodeURIComponent(projectName), {
    headers: { Accept: "application/json" },
  })
    .then((resp) => resp.json())
    .then((data) => {
      if (data?.ok && typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {}
      }
      onSuccess(decodeRepoCommits(data, false));
    })
    .catch((err) => onError(String(err)));
}
