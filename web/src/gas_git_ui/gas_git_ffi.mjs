// Pure Effect boundary FFI for `web/src/gas_git_ui/api.gleam`.
// Used exclusively inside `lustre/effect.from` to communicate with Google Apps Script
// (`google.script.run` in HtmlService or HTTP `?action=list_repos` / `?action=create_repo` / `?action=get_commits`).
//
// Implements client-side commit caching keyed by `${project_name}:${head_oid}`
// using `localStorage` so repeat visits serve the commit DAG and history instantly,
// while purging stale project entries whenever `forceRefresh` or a new `head_oid` arrives.

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

function saveCommitsToLocalCache(projectName, requestedHead, data) {
  if (!data?.ok || typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const prefix = `gas_git_commits_${projectName}_`;
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }

    const actualHead = String(data?.head_oid ?? requestedHead ?? "").trim();
    const serialized = JSON.stringify(data);
    if (actualHead) {
      window.localStorage.setItem(`${prefix}${actualHead}`, serialized);
    }
    window.localStorage.setItem(`gas_git_commits_latest_${projectName}`, serialized);
  } catch (_) {}
}

function loadCommitsFromLocalCache(projectName, cleanHead) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    if (cleanHead) {
      const byHead = window.localStorage.getItem(`gas_git_commits_${projectName}_${cleanHead}`);
      if (byHead) {
        return JSON.parse(byHead);
      }
    }
    const latestRaw = window.localStorage.getItem(`gas_git_commits_latest_${projectName}`);
    if (latestRaw) {
      const parsed = JSON.parse(latestRaw);
      const cachedHead = String(parsed?.head_oid ?? "").trim();
      if (!cleanHead || cachedHead === cleanHead) {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
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

  if (!forceRefresh) {
    const cached = loadCommitsFromLocalCache(projectName, cleanHead);
    if (cached) {
      onSuccess(decodeRepoCommits(cached, true));
      return;
    }
    // If the repository is known to be empty (0 commits) and not force-refreshing, return immediately
    if (!cleanHead) {
      onSuccess(new RepoCommits(true, projectName, "", "refs/heads/main", toList([]), true, ""));
      return;
    }
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
          saveCommitsToLocalCache(projectName, cleanHead, data);
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
      saveCommitsToLocalCache(projectName, cleanHead, data);
      onSuccess(decodeRepoCommits(data, false));
    })
    .catch((err) => onError(String(err)));
}
