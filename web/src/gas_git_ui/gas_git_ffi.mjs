// Pure Effect boundary FFI for `web/src/gas_git_ui/api.gleam`.
// Used exclusively inside `lustre/effect.from` to communicate with Google Apps Script
// (`google.script.run` in HtmlService or HTTP `?action=list_repos` / `?action=create_repo`
// / `?action=get_commits` / `?action=get_commit_detail`).
//
// Persistent Non-Memory Browser Cache Architecture:
//   - Avoids holding cache dictionaries in Gleam `Model` or JS heap variables.
//   - Tier 1 (Primary): `IndexedDB` (`GasGitServerCacheDB` v1) with two object stores:
//       1) `repo_commits` (keyPath: `project_name`) — stores the latest commit graph/log
//          validated against `head_oid`, atomically overwritten on new push or force refresh.
//       2) `commit_details` (keyPath: `cache_key` = `${project_name}:${commit_oid}`) —
//          content-addressable store for each commit's file diffs and full directory/file tree.
//   - Tier 2 (Secondary fallback): `window.caches` (Cache Storage API `gas-git-cache-v1`)
//   - Tier 3 (Tertiary fallback): `window.localStorage`

import { toList } from "../gleam.mjs";
import {
  Commit,
  CommitDetail,
  CommitFileChange,
  CommitTreeEntry,
  RepoCommits,
  RepoSummary,
  ServerState,
} from "./types.mjs";

const IDB_NAME = "GasGitServerCacheDB";
const IDB_VERSION = 1;
const STORE_REPO_COMMITS = "repo_commits";
const STORE_COMMIT_DETAILS = "commit_details";
const CACHE_STORAGE_NAME = "gas-git-cache-v1";

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

// ============================================================================
// Tiered Persistent Browser Cache Engine (IndexedDB -> CacheStorage -> localStorage)
// ============================================================================

function openCacheIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_REPO_COMMITS)) {
          db.createObjectStore(STORE_REPO_COMMITS, { keyPath: "project_name" });
        }
        if (!db.objectStoreNames.contains(STORE_COMMIT_DETAILS)) {
          db.createObjectStore(STORE_COMMIT_DETAILS, { keyPath: "cache_key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    } catch (err) {
      reject(err);
    }
  });
}

async function idbGet(storeName, key) {
  const db = await openCacheIndexedDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

async function idbPut(storeName, value) {
  const db = await openCacheIndexedDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => {
        db.close();
        resolve(true);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

async function cacheApiGet(urlKey) {
  if (typeof window === "undefined" || !window.caches) {
    throw new Error("CacheStorage API not available");
  }
  const cache = await window.caches.open(CACHE_STORAGE_NAME);
  const resp = await cache.match(urlKey);
  if (!resp) return null;
  return await resp.json();
}

async function cacheApiPut(urlKey, record) {
  if (typeof window === "undefined" || !window.caches) {
    throw new Error("CacheStorage API not available");
  }
  const cache = await window.caches.open(CACHE_STORAGE_NAME);
  const resp = new Response(JSON.stringify(record), {
    headers: { "Content-Type": "application/json" },
  });
  await cache.put(urlKey, resp);
}

async function readRepoCommitsPersistent(projectName, cleanHead) {
  // 1. Try IndexedDB primary store
  try {
    const record = await idbGet(STORE_REPO_COMMITS, projectName);
    if (record && record.payload) {
      const cachedHead = String(record.head_oid ?? "").trim();
      if (!cleanHead || cachedHead === cleanHead) {
        return { data: record.payload, backend: "IndexedDB" };
      }
    }
  } catch (_) {}

  // 2. Try window.caches (Cache Storage API)
  try {
    const urlKey = `https://gas-git-cache.local/repo-commits/${encodeURIComponent(projectName)}`;
    const record = await cacheApiGet(urlKey);
    if (record && record.payload) {
      const cachedHead = String(record.head_oid ?? "").trim();
      if (!cleanHead || cachedHead === cleanHead) {
        return { data: record.payload, backend: "CacheStorage" };
      }
    }
  } catch (_) {}

  // 3. Try localStorage fallback
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (cleanHead) {
        const rawByHead = window.localStorage.getItem(`gas_git_commits_${projectName}_${cleanHead}`);
        if (rawByHead) {
          return { data: JSON.parse(rawByHead), backend: "localStorage" };
        }
      }
      const rawLatest = window.localStorage.getItem(`gas_git_commits_latest_${projectName}`);
      if (rawLatest) {
        const parsed = JSON.parse(rawLatest);
        const cachedHead = String(parsed?.head_oid ?? "").trim();
        if (!cleanHead || cachedHead === cleanHead) {
          return { data: parsed, backend: "localStorage" };
        }
      }
    }
  } catch (_) {}

  return null;
}

async function writeRepoCommitsPersistent(projectName, requestedHead, data) {
  if (!data?.ok) return;
  const actualHead = String(data?.head_oid ?? requestedHead ?? "").trim();
  const record = {
    project_name: projectName,
    head_oid: actualHead,
    payload: data,
    updated_at: Date.now(),
  };

  // 1. Write to IndexedDB
  try {
    await idbPut(STORE_REPO_COMMITS, record);
  } catch (_) {}

  // 2. Write to window.caches
  try {
    const urlKey = `https://gas-git-cache.local/repo-commits/${encodeURIComponent(projectName)}`;
    await cacheApiPut(urlKey, record);
  } catch (_) {}

  // 3. Write to localStorage (purging any older keys for this project)
  try {
    if (typeof window !== "undefined" && window.localStorage) {
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
      const serialized = JSON.stringify(data);
      if (actualHead) {
        window.localStorage.setItem(`${prefix}${actualHead}`, serialized);
      }
      window.localStorage.setItem(`gas_git_commits_latest_${projectName}`, serialized);
    }
  } catch (_) {}
}

async function readCommitDetailPersistent(projectName, commitOid) {
  const cleanOid = String(commitOid ?? "").trim();
  if (!cleanOid) return null;
  const cacheKey = `${projectName}:${cleanOid}`;

  // 1. Try IndexedDB primary store
  try {
    const record = await idbGet(STORE_COMMIT_DETAILS, cacheKey);
    if (record && record.payload) {
      return { data: record.payload, backend: "IndexedDB" };
    }
  } catch (_) {}

  // 2. Try window.caches (Cache Storage API)
  try {
    const urlKey = `https://gas-git-cache.local/commit-detail/${encodeURIComponent(projectName)}/${encodeURIComponent(cleanOid)}`;
    const record = await cacheApiGet(urlKey);
    if (record && record.payload) {
      return { data: record.payload, backend: "CacheStorage" };
    }
  } catch (_) {}

  // 3. Try localStorage fallback
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`gas_git_detail_${projectName}_${cleanOid}`);
      if (raw) {
        return { data: JSON.parse(raw), backend: "localStorage" };
      }
    }
  } catch (_) {}

  return null;
}

async function writeCommitDetailPersistent(projectName, requestedOid, data) {
  if (!data?.ok) return;
  const actualOid = String(data?.oid ?? requestedOid ?? "").trim();
  if (!actualOid) return;
  const cacheKey = `${projectName}:${actualOid}`;
  const record = {
    cache_key: cacheKey,
    project_name: projectName,
    oid: actualOid,
    payload: data,
    updated_at: Date.now(),
  };

  // 1. Write to IndexedDB
  try {
    await idbPut(STORE_COMMIT_DETAILS, record);
  } catch (_) {}

  // 2. Write to window.caches
  try {
    const urlKey = `https://gas-git-cache.local/commit-detail/${encodeURIComponent(projectName)}/${encodeURIComponent(actualOid)}`;
    await cacheApiPut(urlKey, record);
  } catch (_) {}

  // 3. Write to localStorage fallback
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        `gas_git_detail_${projectName}_${actualOid}`,
        JSON.stringify(data),
      );
    }
  } catch (_) {}
}

// ============================================================================
// Decoders
// ============================================================================

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

function decodeRepoCommits(rawPayload, fromCache, cacheBackend) {
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
    String(cacheBackend ?? (fromCache ? "IndexedDB" : "GAS Server")),
    String(data?.error ?? ""),
  );
}

function decodeCommitDetail(rawPayload, fromCache, cacheBackend) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawChanges = Array.isArray(data?.changes) ? data.changes : [];
  const changes = rawChanges.map(
    (ch) =>
      new CommitFileChange(
        String(ch?.path ?? ""),
        String(ch?.status ?? "modified"),
        String(ch?.old_oid ?? ""),
        String(ch?.new_oid ?? ""),
        Number(ch?.additions ?? 0),
        Number(ch?.deletions ?? 0),
        String(ch?.patch ?? ""),
      ),
  );

  const rawEntries = Array.isArray(data?.tree_entries) ? data.tree_entries : [];
  const treeEntries = rawEntries.map(
    (te) =>
      new CommitTreeEntry(
        String(te?.path ?? ""),
        String(te?.name ?? ""),
        String(te?.parent_dir ?? ""),
        String(te?.kind ?? "blob"),
        String(te?.oid ?? ""),
        Number(te?.size ?? 0),
        String(te?.content ?? ""),
        Boolean(te?.is_binary ?? false),
      ),
  );

  const oid = String(data?.oid ?? "");
  return new CommitDetail(
    Boolean(data?.ok ?? true),
    String(data?.project_name ?? ""),
    oid,
    String(data?.short_oid ?? oid.slice(0, 7)),
    String(data?.tree_oid ?? ""),
    toList(Array.isArray(data?.parents) ? data.parents.map(String) : []),
    String(data?.author_name ?? ""),
    String(data?.author_email ?? ""),
    Number(data?.timestamp ?? 0),
    String(data?.summary ?? ""),
    String(data?.body ?? ""),
    toList(Array.isArray(data?.refs) ? data.refs.map(String) : []),
    toList(changes),
    toList(treeEntries),
    Boolean(fromCache),
    String(cacheBackend ?? (fromCache ? "IndexedDB" : "GAS Server")),
    String(data?.error ?? ""),
  );
}

// ============================================================================
// Exported FFI Operations
// ============================================================================

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

  const runServerFetch = () => {
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
            writeRepoCommitsPersistent(projectName, cleanHead, data).finally(() => {
              onSuccess(decodeRepoCommits(data, false, "GAS Server"));
            });
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
        writeRepoCommitsPersistent(projectName, cleanHead, data).finally(() => {
          onSuccess(decodeRepoCommits(data, false, "GAS Server"));
        });
      })
      .catch((err) => onError(String(err)));
  };

  if (forceRefresh) {
    runServerFetch();
    return;
  }

  readRepoCommitsPersistent(projectName, cleanHead)
    .then((hit) => {
      if (hit && hit.data) {
        onSuccess(decodeRepoCommits(hit.data, true, hit.backend));
        return;
      }
      if (!cleanHead) {
        onSuccess(
          new RepoCommits(
            true,
            projectName,
            "",
            "refs/heads/main",
            toList([]),
            true,
            "EmptyRepoShortCircuit",
            "",
          ),
        );
        return;
      }
      runServerFetch();
    })
    .catch(() => runServerFetch());
}

export function fetchCommitDetail(projectName, commitOid, forceRefresh, onSuccess, onError) {
  const cleanOid = (commitOid || "").trim();
  if (!cleanOid) {
    onError("Commit OID is required");
    return;
  }

  const runServerFetch = () => {
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
            writeCommitDetailPersistent(projectName, cleanOid, data).finally(() => {
              onSuccess(decodeCommitDetail(data, false, "GAS Server"));
            });
          } catch (e) {
            onError(String(e));
          }
        })
        .withFailureHandler((err) => onError(String(err?.message ?? err)))
        .git_get_commit_detail(projectName, cleanOid);
      return;
    }

    fetch(
      "?action=get_commit_detail&repo=" +
        encodeURIComponent(projectName) +
        "&commit=" +
        encodeURIComponent(cleanOid),
      {
        headers: { Accept: "application/json" },
      },
    )
      .then((resp) => resp.json())
      .then((data) => {
        writeCommitDetailPersistent(projectName, cleanOid, data).finally(() => {
          onSuccess(decodeCommitDetail(data, false, "GAS Server"));
        });
      })
      .catch((err) => onError(String(err)));
  };

  if (forceRefresh) {
    runServerFetch();
    return;
  }

  readCommitDetailPersistent(projectName, cleanOid)
    .then((hit) => {
      if (hit && hit.data) {
        onSuccess(decodeCommitDetail(hit.data, true, hit.backend));
        return;
      }
      runServerFetch();
    })
    .catch(() => runServerFetch());
}
