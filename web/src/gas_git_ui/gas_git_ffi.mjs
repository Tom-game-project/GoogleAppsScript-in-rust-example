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
//
// Written using standard `function` declarations and Promise `.then()` chains (no `async`/`await`)
// for maximum compatibility with all bundlers and Google Apps Script HtmlService environments.

import { toList } from "../gleam.mjs";
import { Commit, CommitDetail, CommitFileChange, CommitTreeEntry, RepoCommits, RepoSummary, ServerState } from "./types.mjs";

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
  return new Promise(function (resolve, reject) {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_REPO_COMMITS)) {
          db.createObjectStore(STORE_REPO_COMMITS, { keyPath: "project_name" });
        }
        if (!db.objectStoreNames.contains(STORE_COMMIT_DETAILS)) {
          db.createObjectStore(STORE_COMMIT_DETAILS, { keyPath: "cache_key" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("IndexedDB open failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

function idbGet(storeName, key) {
  return openCacheIndexedDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = function () {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = function () {
          db.close();
          reject(req.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  });
}

function idbPut(storeName, value) {
  return openCacheIndexedDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      try {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = function () {
          db.close();
          resolve(true);
        };
        req.onerror = function () {
          db.close();
          reject(req.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    });
  });
}

function cacheApiGet(urlKey) {
  if (typeof window === "undefined" || !window.caches) {
    return Promise.reject(new Error("CacheStorage API not available"));
  }
  return window.caches
    .open(CACHE_STORAGE_NAME)
    .then(function (cache) {
      return cache.match(urlKey);
    })
    .then(function (resp) {
      if (!resp) return null;
      return resp.json();
    });
}

function cacheApiPut(urlKey, record) {
  if (typeof window === "undefined" || !window.caches) {
    return Promise.reject(new Error("CacheStorage API not available"));
  }
  return window.caches.open(CACHE_STORAGE_NAME).then(function (cache) {
    const resp = new Response(JSON.stringify(record), {
      headers: { "Content-Type": "application/json" },
    });
    return cache.put(urlKey, resp);
  });
}

function readRepoCommitsFromLocalStorage(projectName, cleanHead) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (cleanHead) {
        const rawByHead = window.localStorage.getItem(
          "gas_git_commits_" + projectName + "_" + cleanHead,
        );
        if (rawByHead) {
          return { data: JSON.parse(rawByHead), backend: "localStorage" };
        }
      }
      const rawLatest = window.localStorage.getItem(
        "gas_git_commits_latest_" + projectName,
      );
      if (rawLatest) {
        const parsed = JSON.parse(rawLatest);
        const cachedHead = String((parsed && parsed.head_oid) || "").trim();
        if (!cleanHead || cachedHead === cleanHead) {
          return { data: parsed, backend: "localStorage" };
        }
      }
    }
  } catch (err) {}
  return null;
}

function readRepoCommitsPersistent(projectName, cleanHead) {
  // 1. Try IndexedDB primary store
  return idbGet(STORE_REPO_COMMITS, projectName)
    .then(function (record) {
      if (record && record.payload) {
        const cachedHead = String(record.head_oid || "").trim();
        if (!cleanHead || cachedHead === cleanHead) {
          return { data: record.payload, backend: "IndexedDB" };
        }
      }
      return null;
    })
    .catch(function () {
      return null;
    })
    .then(function (idbHit) {
      if (idbHit) return idbHit;
      // 2. Try window.caches (Cache Storage API)
      const urlKey =
        "https://gas-git-cache.local/repo-commits/" +
        encodeURIComponent(projectName);
      return cacheApiGet(urlKey)
        .then(function (record) {
          if (record && record.payload) {
            const cachedHead = String(record.head_oid || "").trim();
            if (!cleanHead || cachedHead === cleanHead) {
              return { data: record.payload, backend: "CacheStorage" };
            }
          }
          return null;
        })
        .catch(function () {
          return null;
        });
    })
    .then(function (cacheHit) {
      if (cacheHit) return cacheHit;
      // 3. Try localStorage fallback
      return readRepoCommitsFromLocalStorage(projectName, cleanHead);
    });
}

function writeRepoCommitsPersistent(projectName, requestedHead, data) {
  if (!data || !data.ok) {
    return Promise.resolve(false);
  }
  const actualHead = String(data.head_oid || requestedHead || "").trim();
  const record = {
    project_name: projectName,
    head_oid: actualHead,
    payload: data,
    updated_at: Date.now(),
  };

  // Write to localStorage fallback synchronously (purging stale keys for this project)
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const prefix = "gas_git_commits_" + projectName + "_";
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k);
        }
      }
      for (let j = 0; j < keysToRemove.length; j++) {
        window.localStorage.removeItem(keysToRemove[j]);
      }
      const serialized = JSON.stringify(data);
      if (actualHead) {
        window.localStorage.setItem(prefix + actualHead, serialized);
      }
      window.localStorage.setItem(
        "gas_git_commits_latest_" + projectName,
        serialized,
      );
    }
  } catch (err) {}

  const urlKey =
    "https://gas-git-cache.local/repo-commits/" +
    encodeURIComponent(projectName);

  return idbPut(STORE_REPO_COMMITS, record)
    .catch(function () {
      return false;
    })
    .then(function () {
      return cacheApiPut(urlKey, record).catch(function () {
        return false;
      });
    });
}

function readCommitDetailPersistent(projectName, commitOid) {
  const cleanOid = String(commitOid || "").trim();
  if (!cleanOid) {
    return Promise.resolve(null);
  }
  const cacheKey = projectName + ":" + cleanOid;

  return idbGet(STORE_COMMIT_DETAILS, cacheKey)
    .then(function (record) {
      if (record && record.payload) {
        return { data: record.payload, backend: "IndexedDB" };
      }
      return null;
    })
    .catch(function () {
      return null;
    })
    .then(function (idbHit) {
      if (idbHit) return idbHit;
      const urlKey =
        "https://gas-git-cache.local/commit-detail/" +
        encodeURIComponent(projectName) +
        "/" +
        encodeURIComponent(cleanOid);
      return cacheApiGet(urlKey)
        .then(function (record) {
          if (record && record.payload) {
            return { data: record.payload, backend: "CacheStorage" };
          }
          return null;
        })
        .catch(function () {
          return null;
        });
    })
    .then(function (cacheHit) {
      if (cacheHit) return cacheHit;
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          const raw = window.localStorage.getItem(
            "gas_git_detail_" + projectName + "_" + cleanOid,
          );
          if (raw) {
            return { data: JSON.parse(raw), backend: "localStorage" };
          }
        }
      } catch (err) {}
      return null;
    });
}

function writeCommitDetailPersistent(projectName, requestedOid, data) {
  if (!data || !data.ok) {
    return Promise.resolve(false);
  }
  const actualOid = String(data.oid || requestedOid || "").trim();
  if (!actualOid) {
    return Promise.resolve(false);
  }
  const cacheKey = projectName + ":" + actualOid;
  const record = {
    cache_key: cacheKey,
    project_name: projectName,
    oid: actualOid,
    payload: data,
    updated_at: Date.now(),
  };

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        "gas_git_detail_" + projectName + "_" + actualOid,
        JSON.stringify(data),
      );
    }
  } catch (err) {}

  const urlKey =
    "https://gas-git-cache.local/commit-detail/" +
    encodeURIComponent(projectName) +
    "/" +
    encodeURIComponent(actualOid);

  return idbPut(STORE_COMMIT_DETAILS, record)
    .catch(function () {
      return false;
    })
    .then(function () {
      return cacheApiPut(urlKey, record).catch(function () {
        return false;
      });
    });
}

// ============================================================================
// Decoders
// ============================================================================

function decodeServerState(rawPayload) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawRepos = Array.isArray(data && data.repositories) ? data.repositories : [];
  const repoItems = rawRepos.map(function (r) {
    const rName = String((r && r.name) || "");
    return new RepoSummary(
      rName,
      String((r && r.folder_name) || rName + ".git"),
      String((r && r.folder_id) || ""),
      String((r && r.folder_url) || ""),
      String((r && r.description) || ""),
      String((r && r.default_branch) || "refs/heads/main"),
      String((r && r.head_oid) || ""),
      Number((r && r.branch_count) || 0),
    );
  });

  let baseUrl = String((data && data.base_url) || "");
  if (!baseUrl || baseUrl.includes("<DEPLOYMENT_ID>")) {
    const detected = detectDefaultBaseUrl();
    if (detected && !detected.includes("googleusercontent.com")) {
      baseUrl = detected;
    }
  }

  return new ServerState(
    Boolean(data && data.ok !== undefined ? data.ok : true),
    Boolean(data && data.drive_folder_configured),
    String((data && data.drive_folder_id) || ""),
    String((data && data.drive_folder_url) || ""),
    baseUrl || "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec",
    String((data && data.selected_project) || ""),
    toList(repoItems),
    String((data && data.message) || ""),
    String((data && data.error) || ""),
  );
}

function decodeRepoCommits(rawPayload, fromCache, cacheBackend) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawCommits = Array.isArray(data && data.commits) ? data.commits : [];
  const commitItems = rawCommits.map(function (c) {
    const oid = String((c && c.oid) || "");
    return new Commit(
      oid,
      String((c && c.short_oid) || oid.slice(0, 7)),
      toList(Array.isArray(c && c.parents) ? c.parents.map(String) : []),
      String((c && c.author_name) || ""),
      String((c && c.author_email) || ""),
      Number((c && c.timestamp) || 0),
      String((c && c.summary) || ""),
      String((c && c.body) || ""),
      toList(Array.isArray(c && c.refs) ? c.refs.map(String) : []),
    );
  });

  return new RepoCommits(
    Boolean(data && data.ok !== undefined ? data.ok : true),
    String((data && data.project_name) || ""),
    String((data && data.head_oid) || ""),
    String((data && data.default_branch) || "refs/heads/main"),
    toList(commitItems),
    Boolean(fromCache),
    String(cacheBackend || (fromCache ? "IndexedDB" : "GAS Server")),
    String((data && data.error) || ""),
  );
}

function decodeCommitDetail(rawPayload, fromCache, cacheBackend) {
  const data = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const rawChanges = Array.isArray(data && data.changes) ? data.changes : [];
  const changes = rawChanges.map(function (ch) {
    return new CommitFileChange(
      String((ch && ch.path) || ""),
      String((ch && ch.status) || "modified"),
      String((ch && ch.old_oid) || ""),
      String((ch && ch.new_oid) || ""),
      Number((ch && ch.additions) || 0),
      Number((ch && ch.deletions) || 0),
      String((ch && ch.patch) || ""),
    );
  });

  const rawEntries = Array.isArray(data && data.tree_entries) ? data.tree_entries : [];
  const treeEntries = rawEntries.map(function (te) {
    return new CommitTreeEntry(
      String((te && te.path) || ""),
      String((te && te.name) || ""),
      String((te && te.parent_dir) || ""),
      String((te && te.kind) || "blob"),
      String((te && te.oid) || ""),
      Number((te && te.size) || 0),
      String((te && te.content) || ""),
      Boolean(te && te.is_binary),
    );
  });

  const oid = String((data && data.oid) || "");
  return new CommitDetail(
    Boolean(data && data.ok !== undefined ? data.ok : true),
    String((data && data.project_name) || ""),
    oid,
    String((data && data.short_oid) || oid.slice(0, 7)),
    String((data && data.tree_oid) || ""),
    toList(Array.isArray(data && data.parents) ? data.parents.map(String) : []),
    String((data && data.author_name) || ""),
    String((data && data.author_email) || ""),
    Number((data && data.timestamp) || 0),
    String((data && data.summary) || ""),
    String((data && data.body) || ""),
    toList(Array.isArray(data && data.refs) ? data.refs.map(String) : []),
    toList(changes),
    toList(treeEntries),
    Boolean(fromCache),
    String(cacheBackend || (fromCache ? "IndexedDB" : "GAS Server")),
    String((data && data.error) || ""),
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
      .withSuccessHandler(function (res) {
        try {
          onSuccess(decodeServerState(res));
        } catch (e) {
          onError(String(e));
        }
      })
      .withFailureHandler(function (err) {
        onError(String((err && err.message) || err));
      })
      .git_list_repos();
    return;
  }

  fetch("?action=list_repos", { headers: { Accept: "application/json" } })
    .then(function (resp) {
      return resp.json();
    })
    .then(function (json) {
      onSuccess(decodeServerState(json));
    })
    .catch(function (err) {
      onError(String(err));
    });
}

export function createRepository(projectName, description, onSuccess, onError) {
  if (
    typeof window !== "undefined" &&
    window.google &&
    window.google.script &&
    window.google.script.run
  ) {
    window.google.script.run
      .withSuccessHandler(function (res) {
        try {
          onSuccess(decodeServerState(res));
        } catch (e) {
          onError(String(e));
        }
      })
      .withFailureHandler(function (err) {
        onError(String((err && err.message) || err));
      })
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
    .then(function (resp) {
      return resp.json();
    })
    .then(function (json) {
      onSuccess(decodeServerState(json));
    })
    .catch(function (err) {
      onError(String(err));
    });
}

export function fetchRepoCommits(projectName, headOid, forceRefresh, onSuccess, onError) {
  const cleanHead = (headOid || "").trim();

  function runServerFetch() {
    if (
      typeof window !== "undefined" &&
      window.google &&
      window.google.script &&
      window.google.script.run
    ) {
      window.google.script.run
        .withSuccessHandler(function (res) {
          try {
            const data = typeof res === "string" ? JSON.parse(res) : res;
            writeRepoCommitsPersistent(projectName, cleanHead, data).then(
              function () {
                onSuccess(decodeRepoCommits(data, false, "GAS Server"));
              },
              function () {
                onSuccess(decodeRepoCommits(data, false, "GAS Server"));
              },
            );
          } catch (e) {
            onError(String(e));
          }
        })
        .withFailureHandler(function (err) {
          onError(String((err && err.message) || err));
        })
        .git_get_commits(projectName);
      return;
    }

    fetch("?action=get_commits&repo=" + encodeURIComponent(projectName), {
      headers: { Accept: "application/json" },
    })
      .then(function (resp) {
        return resp.json();
      })
      .then(function (data) {
        writeRepoCommitsPersistent(projectName, cleanHead, data).then(
          function () {
            onSuccess(decodeRepoCommits(data, false, "GAS Server"));
          },
          function () {
            onSuccess(decodeRepoCommits(data, false, "GAS Server"));
          },
        );
      })
      .catch(function (err) {
        onError(String(err));
      });
  }

  if (forceRefresh) {
    runServerFetch();
    return;
  }

  readRepoCommitsPersistent(projectName, cleanHead).then(
    function (hit) {
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
    },
    function () {
      runServerFetch();
    },
  );
}

export function fetchCommitDetail(projectName, commitOid, forceRefresh, onSuccess, onError) {
  const cleanOid = (commitOid || "").trim();
  if (!cleanOid) {
    onError("Commit OID is required");
    return;
  }

  function runServerFetch() {
    if (
      typeof window !== "undefined" &&
      window.google &&
      window.google.script &&
      window.google.script.run
    ) {
      window.google.script.run
        .withSuccessHandler(function (res) {
          try {
            const data = typeof res === "string" ? JSON.parse(res) : res;
            writeCommitDetailPersistent(projectName, cleanOid, data).then(
              function () {
                onSuccess(decodeCommitDetail(data, false, "GAS Server"));
              },
              function () {
                onSuccess(decodeCommitDetail(data, false, "GAS Server"));
              },
            );
          } catch (e) {
            onError(String(e));
          }
        })
        .withFailureHandler(function (err) {
          onError(String((err && err.message) || err));
        })
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
      .then(function (resp) {
        return resp.json();
      })
      .then(function (data) {
        writeCommitDetailPersistent(projectName, cleanOid, data).then(
          function () {
            onSuccess(decodeCommitDetail(data, false, "GAS Server"));
          },
          function () {
            onSuccess(decodeCommitDetail(data, false, "GAS Server"));
          },
        );
      })
      .catch(function (err) {
        onError(String(err));
      });
  }

  if (forceRefresh) {
    runServerFetch();
    return;
  }

  readCommitDetailPersistent(projectName, cleanOid).then(
    function (hit) {
      if (hit && hit.data) {
        onSuccess(decodeCommitDetail(hit.data, true, hit.backend));
        return;
      }
      runServerFetch();
    },
    function () {
      runServerFetch();
    },
  );
}
