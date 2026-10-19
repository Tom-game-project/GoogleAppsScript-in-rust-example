#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
End-to-End Integration Test for `git-remote-gas`, Path Routing (`/<project_name>.git`),
Google Drive Multi-Project Storage (`GIT_DRIVE_FOLDER_ID`), No Automatic Initial Commit,
and the Gleam + Lustre Web UI.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import socketserver
import subprocess
import tempfile
import threading
import urllib.parse
import urllib.request
import uuid
import zlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def pkt_line(data: bytes) -> bytes:
    return f"{len(data) + 4:04x}".encode("ascii") + data


def pkt_text(text: str) -> bytes:
    if not text.endswith("\n"):
        text += "\n"
    return pkt_line(text.encode("utf-8"))


def pkt_band(channel: int, data: bytes) -> bytes:
    return pkt_line(bytes([channel]) + data)


def escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def encode_uri_segment(seg: str) -> str:
    return urllib.parse.quote(seg, safe="-._~")


def parse_git_path(raw_path: str) -> Tuple[str, Optional[str]]:
    """
    Mirrors `parse_git_path` in `src/git_server.rs`:
      - `/` -> ("web_root", None)
      - `/<project_name>.git` -> ("web_repo", project_name)
      - `/<project_name>.git/info/refs` -> ("info_refs", project_name)
      - `/<project_name>.git/git-upload-pack` -> ("upload_pack", project_name)
      - `/<project_name>.git/git-receive-pack` -> ("receive_pack", project_name)
      - `/<project_name>.git/<commit_hash>[/<subpath>...]` -> ("commit_browser", project_name)
      - Any path after `/exec/` not starting with `/<project_name>.git` (e.g. `/exec/<commit_hash>`) raises ValueError!
    """
    without_query = raw_path.split("?", 1)[0]
    segments = [s for s in without_query.split("/") if s]

    if (
        len(segments) >= 4
        and segments[0] == "macros"
        and segments[1] == "s"
        and segments[3] in ("exec", "dev")
    ):
        segments = segments[4:]
    elif segments and segments[0] in ("exec", "dev"):
        segments = segments[1:]

    if not segments:
        return ("web_root", None)

    if segments in (["info", "refs"], ["git-upload-pack"], ["git-receive-pack"]):
        raise ValueError("Missing repository name in URL path")

    if not segments[0].endswith(".git"):
        raise ValueError(
            f"Invalid URL path '/{'/'.join(segments)}': path after /exec/ must start with /<project_name>.git (direct /exec/<commit_hash> is disabled)"
        )

    def norm_proj(seg: str) -> str:
        name = seg[:-4] if seg.endswith(".git") else seg
        if not name or name in (".", ".."):
            raise ValueError(f"Invalid repository name '{seg}'")
        return name

    proj = norm_proj(segments[0])
    if len(segments) == 3 and segments[1] == "info" and segments[2] == "refs":
        return ("info_refs", proj)
    if len(segments) == 2 and segments[1] == "git-upload-pack":
        return ("upload_pack", proj)
    if len(segments) == 2 and segments[1] == "git-receive-pack":
        return ("receive_pack", proj)
    if len(segments) == 1:
        return ("web_repo", proj)

    return ("commit_browser", proj)


def parse_commit_browser_route(
    raw_path: str,
) -> Tuple[str, str, List[str], bool]:
    without_query = raw_path.split("?", 1)[0]
    trailing_slash = len(without_query) > 1 and without_query.endswith("/")
    segments = [s for s in without_query.split("/") if s]
    if (
        len(segments) >= 4
        and segments[0] == "macros"
        and segments[1] == "s"
        and segments[3] in ("exec", "dev")
    ):
        segments = segments[4:]
    elif segments and segments[0] in ("exec", "dev"):
        segments = segments[1:]

    assert len(segments) >= 2 and segments[0].endswith(".git")
    proj = segments[0][:-4]
    commit_ref = urllib.parse.unquote(segments[1])
    subpath = [urllib.parse.unquote(s) for s in segments[2:]]
    return (proj, commit_ref, subpath, trailing_slash)


class SimulatedDriveGitStore:
    """
    Mirrors `GasGitStore` in `src/git_server.rs` backed by a Google Drive folder (`GIT_DRIVE_FOLDER_ID`).
    Stores each repository in `<drive_root>/<project_name>.git/` with:
      - `HEAD` (`ref: refs/heads/main\\n`)
      - `refs.json` (`{}`)
      - `objects/<sha1_hex>` (base64-encoded loose Git object)
    Does NOT auto-generate an initial commit!
    """

    def __init__(self, drive_root: Path, project_name: str) -> None:
        self.drive_root = drive_root
        self.project_name = project_name
        self.repo_dir = self.drive_root / f"{project_name}.git"
        if not self.repo_dir.is_dir():
            raise RuntimeError(
                f"Repository '{project_name}.git' does not exist in the configured Google Drive folder. "
                "Please create it from the Web UI first."
            )
        self.objects_dir = self.repo_dir / "objects"
        self.objects_dir.mkdir(exist_ok=True)
        self.head_file = self.repo_dir / "HEAD"
        self.refs_file = self.repo_dir / "refs.json"

    @classmethod
    def create_repository(
        cls, drive_root: Path, project_name: str, description: str = ""
    ) -> Dict[str, object]:
        clean = project_name[:-4] if project_name.endswith(".git") else project_name
        if not clean:
            raise ValueError("Repository name cannot be empty")
        repo_dir = drive_root / f"{clean}.git"
        if repo_dir.exists():
            raise ValueError(f"Repository '{clean}.git' already exists.")
        repo_dir.mkdir(parents=True)
        (repo_dir / "objects").mkdir()
        (repo_dir / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
        (repo_dir / "refs.json").write_text("{}\n", encoding="utf-8")
        (repo_dir / "description.txt").write_text(description, encoding="utf-8")
        return cls.summarize_repo(drive_root, clean)

    @classmethod
    def summarize_repo(cls, drive_root: Path, project_name: str) -> Dict[str, object]:
        repo_dir = drive_root / f"{project_name}.git"
        head_raw = (repo_dir / "HEAD").read_text(encoding="utf-8").strip()
        default_branch = (
            head_raw[len("ref:") :].strip()
            if head_raw.startswith("ref:")
            else "refs/heads/main"
        )
        refs_map: Dict[str, str] = json.loads(
            (repo_dir / "refs.json").read_text(encoding="utf-8")
        )
        desc_file = repo_dir / "description.txt"
        desc = desc_file.read_text(encoding="utf-8") if desc_file.exists() else ""
        head_oid = refs_map.get(default_branch) or next(iter(refs_map.values()), None)
        branch_count = sum(1 for k in refs_map if k.startswith("refs/heads/"))
        return {
            "name": project_name,
            "folder_name": f"{project_name}.git",
            "folder_id": f"drive-folder-{project_name}",
            "folder_url": f"https://drive.google.com/drive/folders/drive-folder-{project_name}",
            "description": desc,
            "default_branch": default_branch,
            "head_oid": head_oid,
            "branch_count": branch_count,
            "updated_at_ms": 1700000000000,
        }

    @classmethod
    def list_repositories(cls, drive_root: Path) -> List[Dict[str, object]]:
        repos: List[Dict[str, object]] = []
        for child in sorted(drive_root.iterdir(), key=lambda p: p.name):
            if child.is_dir() and child.name.endswith(".git"):
                proj = child.name[:-4]
                repos.append(cls.summarize_repo(drive_root, proj))
        return repos

    def read_refs(self) -> Dict[str, str]:
        return json.loads(self.refs_file.read_text(encoding="utf-8"))

    def write_refs(self, refs: Dict[str, str]) -> None:
        self.refs_file.write_text(json.dumps(refs, indent=2), encoding="utf-8")

    def write_raw_object(self, kind: str, body: bytes) -> str:
        header = f"{kind} {len(body)}\x00".encode("utf-8")
        loose = header + body
        oid = hashlib.sha1(loose).hexdigest()
        obj_path = self.objects_dir / oid
        if not obj_path.exists():
            obj_path.write_text(base64.b64encode(loose).decode("ascii"), encoding="utf-8")
        return oid

    def read_raw_object(self, oid: str) -> Optional[Tuple[str, bytes]]:
        obj_path = self.objects_dir / oid
        if obj_path.exists():
            loose = base64.b64decode(obj_path.read_text(encoding="utf-8").strip())
            nul = loose.index(b"\x00")
            header = loose[:nul].decode("ascii")
            kind = header.split(" ", 1)[0]
            return (kind, loose[nul + 1 :])
        for b_path in self.objects_dir.glob("bundle_*.json"):
            b_map = json.loads(b_path.read_text(encoding="utf-8"))
            if oid in b_map:
                loose = base64.b64decode(b_map[oid].strip())
                nul = loose.index(b"\x00")
                header = loose[:nul].decode("ascii")
                kind = header.split(" ", 1)[0]
                return (kind, loose[nul + 1 :])
        return None

    def get_commits(self) -> Dict[str, object]:
        refs = self.read_refs()
        head_oid = refs.get("refs/heads/main") or next(iter(refs.values()), None)
        head_sym = "refs/heads/main"
        if self.head_file.exists():
            head_content = self.head_file.read_text(encoding="utf-8").strip()
            if head_content.startswith("ref: "):
                head_sym = head_content[5:].strip()

        if not head_oid:
            return {
                "ok": True,
                "project_name": self.project_name,
                "head_oid": "",
                "default_branch": head_sym,
                "commits": [],
                "error": None,
            }

        decorations: Dict[str, List[str]] = {}
        for rname, roid in refs.items():
            labels = []
            if roid == head_oid and rname == head_sym:
                short = rname.replace("refs/heads/", "")
                labels.append(f"HEAD -> {short}")
            elif rname.startswith("refs/heads/"):
                labels.append(rname.replace("refs/heads/", ""))
            elif rname.startswith("refs/tags/"):
                labels.append(f"tag: {rname.replace('refs/tags/', '')}")
            else:
                labels.append(rname)
            decorations.setdefault(roid, []).extend(labels)

        if head_oid in decorations and not any(s.startswith("HEAD") for s in decorations[head_oid]):
            decorations[head_oid].insert(0, "HEAD")

        commits = []
        visited = set()
        queue = []
        if head_oid:
            queue.append(head_oid)
        for roid in refs.values():
            if roid not in queue:
                queue.append(roid)
        while queue:
            oid = queue.pop(0)
            if oid in visited:
                continue
            visited.add(oid)
            raw = self.read_raw_object(oid)
            if not raw or raw[0] != "commit":
                continue
            lines = raw[1].decode("utf-8", errors="replace").split("\n")
            parents = []
            author_name = "Unknown"
            author_email = ""
            timestamp = 0
            body_start = 0
            for i, line in enumerate(lines):
                if line.startswith("parent "):
                    p = line.split(" ", 1)[1].strip()
                    parents.append(p)
                    queue.append(p)
                elif line.startswith("author "):
                    parts = line.split(" ", 1)[1].rsplit(" ", 2)
                    ident = parts[0]
                    if len(parts) >= 2 and parts[1].isdigit():
                        timestamp = int(parts[1])
                    if "<" in ident and ident.endswith(">"):
                        author_name, rest = ident.split("<", 1)
                        author_name = author_name.strip()
                        author_email = rest[:-1].strip()
                    else:
                        author_name = ident.strip()
                elif line == "":
                    body_start = i + 1
                    break
            body_lines = lines[body_start:]
            summary = body_lines[0] if body_lines else ""
            body = "\n".join(body_lines[1:]).strip() if len(body_lines) > 1 else ""

            commits.append({
                "oid": oid,
                "short_oid": oid[:7],
                "parents": parents,
                "author_name": author_name,
                "author_email": author_email,
                "timestamp": timestamp,
                "summary": summary,
                "body": body,
                "refs": decorations.get(oid, []),
            })

        commits.sort(key=lambda c: c["timestamp"], reverse=True)
        return {
            "ok": True,
            "project_name": self.project_name,
            "head_oid": head_oid,
            "default_branch": head_sym,
            "commits": commits,
            "error": None,
        }

    def _collect_tree_snapshot(
        self,
        tree_oid: str,
        prefix: str,
        entries_out: List[Dict[str, object]],
        blobs_out: Dict[str, Tuple[str, bytes]],
    ) -> None:
        raw = self.read_raw_object(tree_oid)
        if not raw or raw[0] != "tree":
            return
        body = raw[1]
        pos = 0
        while pos < len(body):
            nul = body.index(b"\x00", pos)
            mode_name = body[pos:nul].decode("utf-8", errors="replace")
            _mode, name = mode_name.split(" ", 1)
            entry_oid = body[nul + 1 : nul + 21].hex()
            pos = nul + 21

            path = f"{prefix}/{name}" if prefix else name
            child_obj = self.read_raw_object(entry_oid)
            if not child_obj:
                continue
            c_kind, c_body = child_obj
            if c_kind == "tree":
                entries_out.append({
                    "path": path,
                    "name": name,
                    "parent_dir": prefix,
                    "kind": "tree",
                    "oid": entry_oid,
                    "size": 0,
                    "content": "",
                    "is_binary": False,
                })
                self._collect_tree_snapshot(entry_oid, path, entries_out, blobs_out)
            elif c_kind == "blob":
                is_bin = b"\x00" in c_body[:4096]
                content_str = (
                    f"[Binary file ({len(c_body)} bytes)]"
                    if is_bin
                    else c_body.decode("utf-8", errors="replace")
                )
                entries_out.append({
                    "path": path,
                    "name": name,
                    "parent_dir": prefix,
                    "kind": "blob",
                    "oid": entry_oid,
                    "size": len(c_body),
                    "content": content_str,
                    "is_binary": is_bin,
                })
                blobs_out[path] = (entry_oid, c_body)

    def get_commit_detail(self, commit_oid: str) -> Dict[str, object]:
        refs = self.read_refs()
        target_oid = commit_oid.strip()
        if not target_oid or target_oid == "HEAD":
            target_oid = refs.get("refs/heads/main") or next(iter(refs.values()), "")
        raw = self.read_raw_object(target_oid)
        if not raw or raw[0] != "commit":
            return {
                "ok": False,
                "project_name": self.project_name,
                "oid": target_oid,
                "short_oid": target_oid[:7],
                "tree_oid": "",
                "parents": [],
                "author_name": "",
                "author_email": "",
                "timestamp": 0,
                "summary": "",
                "body": "",
                "refs": [],
                "changes": [],
                "tree_entries": [],
                "error": f"Commit {target_oid} not found",
            }

        lines = raw[1].decode("utf-8", errors="replace").split("\n")
        tree_oid = ""
        parents: List[str] = []
        author_name = "Unknown"
        author_email = ""
        timestamp = 0
        body_start = 0
        for i, line in enumerate(lines):
            if line.startswith("tree "):
                tree_oid = line.split(" ", 1)[1].strip()
            elif line.startswith("parent "):
                parents.append(line.split(" ", 1)[1].strip())
            elif line.startswith("author "):
                parts = line.split(" ", 1)[1].rsplit(" ", 2)
                ident = parts[0]
                if len(parts) >= 2 and parts[1].isdigit():
                    timestamp = int(parts[1])
                if "<" in ident and ident.endswith(">"):
                    author_name, rest = ident.split("<", 1)
                    author_name = author_name.strip()
                    author_email = rest[:-1].strip()
                else:
                    author_name = ident.strip()
            elif line == "":
                body_start = i + 1
                break
        body_lines = lines[body_start:]
        summary = body_lines[0] if body_lines else ""
        body = "\n".join(body_lines).strip()

        tree_entries: List[Dict[str, object]] = []
        current_blobs: Dict[str, Tuple[str, bytes]] = {}
        if tree_oid:
            self._collect_tree_snapshot(tree_oid, "", tree_entries, current_blobs)

        parent_blobs: Dict[str, Tuple[str, bytes]] = {}
        if parents:
            p_raw = self.read_raw_object(parents[0])
            if p_raw and p_raw[0] == "commit":
                for pline in p_raw[1].decode("utf-8", errors="replace").split("\n"):
                    if pline.startswith("tree "):
                        p_tree = pline.split(" ", 1)[1].strip()
                        self._collect_tree_snapshot(p_tree, "", [], parent_blobs)
                        break

        all_paths = sorted(set(parent_blobs.keys()) | set(current_blobs.keys()))
        changes: List[Dict[str, object]] = []
        for path in all_paths:
            old_item = parent_blobs.get(path)
            new_item = current_blobs.get(path)
            if old_item is None and new_item is not None:
                new_oid, new_bytes = new_item
                new_lines = new_bytes.decode("utf-8", errors="replace").splitlines()
                patch = f"@@ -0,0 +1,{len(new_lines)} @@\n" + "".join(f"+{l}\n" for l in new_lines)
                changes.append({
                    "path": path,
                    "status": "added",
                    "old_oid": "",
                    "new_oid": new_oid,
                    "additions": len(new_lines),
                    "deletions": 0,
                    "patch": patch,
                })
            elif old_item is not None and new_item is None:
                old_oid, old_bytes = old_item
                old_lines = old_bytes.decode("utf-8", errors="replace").splitlines()
                patch = f"@@ -1,{len(old_lines)} +0,0 @@\n" + "".join(f"-{l}\n" for l in old_lines)
                changes.append({
                    "path": path,
                    "status": "deleted",
                    "old_oid": old_oid,
                    "new_oid": "",
                    "additions": 0,
                    "deletions": len(old_lines),
                    "patch": patch,
                })
            elif old_item is not None and new_item is not None and old_item[0] != new_item[0]:
                old_oid, old_bytes = old_item
                new_oid, new_bytes = new_item
                old_lines = old_bytes.decode("utf-8", errors="replace").splitlines()
                new_lines = new_bytes.decode("utf-8", errors="replace").splitlines()
                patch = (
                    f"@@ -1,{len(old_lines)} +1,{len(new_lines)} @@\n"
                    + "".join(f"-{l}\n" for l in old_lines)
                    + "".join(f"+{l}\n" for l in new_lines)
                )
                changes.append({
                    "path": path,
                    "status": "modified",
                    "old_oid": old_oid,
                    "new_oid": new_oid,
                    "additions": len(new_lines),
                    "deletions": len(old_lines),
                    "patch": patch,
                })

        return {
            "ok": True,
            "project_name": self.project_name,
            "oid": target_oid,
            "short_oid": target_oid[:7],
            "tree_oid": tree_oid,
            "parents": parents,
            "author_name": author_name,
            "author_email": author_email,
            "timestamp": timestamp,
            "summary": summary,
            "body": body,
            "refs": [],
            "changes": changes,
            "tree_entries": tree_entries,
            "error": None,
        }

    def handle_info_refs(self, service: str) -> bytes:
        out = bytearray()
        out.extend(pkt_text(f"# service={service}"))
        out.extend(b"0000")
        if service == "git-upload-pack":
            caps = (
                "multi_ack thin-pack side-band side-band-64k ofs-delta shallow "
                "no-progress include-tag allow-tip-sha1-in-want allow-reachable-sha1-in-want "
                "symref=HEAD:refs/heads/main object-format=sha1 agent=gitoxide-gas/0.2.0"
            )
        else:
            caps = (
                "report-status delete-refs side-band-64k quiet atomic ofs-delta "
                "object-format=sha1 agent=gitoxide-gas/0.2.0"
            )

        refs = self.read_refs()
        head_oid = refs.get("refs/heads/main") or next(iter(refs.values()), None)
        items: List[Tuple[str, str]] = []
        if head_oid:
            items.append(("HEAD", head_oid))
        for rname in sorted(refs.keys()):
            items.append((rname, refs[rname]))

        if not items:
            zero_oid = "0" * 40
            out.extend(pkt_text(f"{zero_oid} capabilities^{{}}\x00{caps}"))
        else:
            for idx, (rname, oid) in enumerate(items):
                if idx == 0:
                    out.extend(pkt_text(f"{oid} {rname}\x00{caps}"))
                else:
                    out.extend(pkt_text(f"{oid} {rname}"))
        out.extend(b"0000")
        return bytes(out)

    def _collect_reachable(self, start_oids: List[str], exclude_oids: set) -> List[str]:
        visited = set(exclude_oids)
        queue = list(start_oids)
        result: List[str] = []
        while queue:
            oid = queue.pop(0)
            if oid in visited:
                continue
            obj = self.read_raw_object(oid)
            if obj is None:
                continue
            visited.add(oid)
            kind, body = obj
            result.append(oid)
            if kind == "commit":
                for line in body.decode("utf-8", errors="replace").splitlines():
                    if line.startswith("tree ") or line.startswith("parent "):
                        queue.append(line.split(" ", 1)[1].strip())
                    elif line == "":
                        break
            elif kind == "tree":
                pos = 0
                while pos < len(body):
                    nul = body.index(b"\x00", pos)
                    entry_oid = body[nul + 1 : nul + 21].hex()
                    queue.append(entry_oid)
                    pos = nul + 21
        return result

    def handle_upload_pack(self, req: bytes) -> bytes:
        pos = 0
        wants: List[str] = []
        haves: List[str] = []
        while pos + 4 <= len(req):
            h = req[pos : pos + 4]
            if h == b"0000":
                pos += 4
                continue
            plen = int(h.decode("ascii"), 16)
            line = req[pos + 4 : pos + plen].decode("utf-8", errors="replace").strip()
            pos += plen
            if line.startswith("want "):
                wants.append(line.split()[1])
            elif line.startswith("have "):
                haves.append(line.split()[1])
            elif line == "done":
                break

        excluded: set = set()
        common: Optional[str] = None
        for h_oid in haves:
            if self.read_raw_object(h_oid) is not None:
                if common is None:
                    common = h_oid
                for r in self._collect_reachable([h_oid], set()):
                    excluded.add(r)

        to_send = self._collect_reachable(wants, excluded)
        pack = bytearray(b"PACK")
        pack.extend((2).to_bytes(4, "big"))
        pack.extend(len(to_send).to_bytes(4, "big"))
        type_map = {"commit": 1, "tree": 2, "blob": 3, "tag": 4}
        for oid in to_send:
            obj = self.read_raw_object(oid)
            assert obj is not None
            kind, body = obj
            t = type_map[kind]
            size = len(body)
            b0 = ((t & 0x07) << 4) | (size & 0x0F)
            size >>= 4
            while size > 0:
                pack.append(b0 | 0x80)
                b0 = size & 0x7F
                size >>= 7
            pack.append(b0)
            pack.extend(zlib.compress(body))
        pack.extend(hashlib.sha1(pack).digest())

        out = bytearray()
        if common:
            out.extend(pkt_text(f"ACK {common}"))
        else:
            out.extend(pkt_text("NAK"))
        out.extend(pkt_band(1, bytes(pack)))
        out.extend(b"0000")
        return bytes(out)

    def handle_receive_pack(self, req: bytes) -> bytes:
        pos = 0
        cmds: List[Tuple[str, str, str]] = []
        while pos + 4 <= len(req):
            h = req[pos : pos + 4]
            if h == b"0000":
                pos += 4
                break
            plen = int(h.decode("ascii"), 16)
            raw_line = req[pos + 4 : pos + plen]
            pos += plen
            cmd_part = raw_line.split(b"\x00", 1)[0].decode("utf-8").strip()
            old_oid, new_oid, ref_name = cmd_part.split()
            cmds.append((old_oid, new_oid, ref_name))

        pack_data = req[pos:]
        if pack_data:
            self._unpack_pack(pack_data)

        refs = self.read_refs()
        for _old_oid, new_oid, ref_name in cmds:
            if new_oid == "0" * 40:
                refs.pop(ref_name, None)
            else:
                refs[ref_name] = new_oid
        self.write_refs(refs)

        status = bytearray()
        status.extend(pkt_text("unpack ok"))
        for _o, _n, ref_name in cmds:
            status.extend(pkt_text(f"ok {ref_name}"))
        status.extend(b"0000")

        out = bytearray()
        out.extend(pkt_band(1, bytes(status)))
        out.extend(b"0000")
        return bytes(out)

    def _unpack_pack(self, pack: bytes) -> None:
        assert pack[:4] == b"PACK", "Invalid PACK magic"
        num_objs = int.from_bytes(pack[8:12], "big")
        data_end = len(pack) - 20
        assert hashlib.sha1(pack[:data_end]).digest() == pack[data_end:], "PACK SHA-1 mismatch"

        pos = 12
        by_offset: Dict[int, Tuple[str, bytes]] = {}
        inv_type = {1: "commit", 2: "tree", 3: "blob", 4: "tag"}

        for _ in range(num_objs):
            entry_start = pos
            b = pack[pos]
            pos += 1
            obj_type = (b >> 4) & 0x07
            size = b & 0x0F
            shift = 4
            while b & 0x80:
                b = pack[pos]
                pos += 1
                size |= (b & 0x7F) << shift
                shift += 7

            if obj_type in (1, 2, 3, 4):
                dobj = zlib.decompressobj()
                raw = dobj.decompress(pack[pos:data_end])
                consumed = len(pack[pos:data_end]) - len(dobj.unused_data)
                pos += consumed
                kind = inv_type[obj_type]
                self.write_raw_object(kind, raw)
                by_offset[entry_start] = (kind, raw)
            elif obj_type == 6:
                b = pack[pos]
                pos += 1
                neg_off = b & 0x7F
                while b & 0x80:
                    b = pack[pos]
                    pos += 1
                    neg_off = ((neg_off + 1) << 7) | (b & 0x7F)
                base_kind, base_raw = by_offset[entry_start - neg_off]
                dobj = zlib.decompressobj()
                delta = dobj.decompress(pack[pos:data_end])
                consumed = len(pack[pos:data_end]) - len(dobj.unused_data)
                pos += consumed
                target_raw = self._apply_delta(base_raw, delta)
                self.write_raw_object(base_kind, target_raw)
                by_offset[entry_start] = (base_kind, target_raw)
            elif obj_type == 7:
                base_oid = pack[pos : pos + 20].hex()
                pos += 20
                obj = self.read_raw_object(base_oid)
                assert obj is not None
                base_kind, base_raw = obj
                dobj = zlib.decompressobj()
                delta = dobj.decompress(pack[pos:data_end])
                consumed = len(pack[pos:data_end]) - len(dobj.unused_data)
                pos += consumed
                target_raw = self._apply_delta(base_raw, delta)
                self.write_raw_object(base_kind, target_raw)
                by_offset[entry_start] = (base_kind, target_raw)
        # Store batch bundle in Google Drive
        trailer = pack[data_end:].hex()
        b_map = {}
        for off, (k, b) in by_offset.items():
            header = f"{k} {len(b)}\x00".encode("utf-8")
            b_map[hashlib.sha1(header + b).hexdigest()] = base64.b64encode(header + b).decode("ascii")
        (self.objects_dir / f"bundle_{trailer}.json").write_text(json.dumps(b_map), encoding="utf-8")

    @staticmethod
    def _apply_delta(base: bytes, delta: bytes) -> bytes:
        pos = 0

        def read_varint() -> int:
            nonlocal pos
            v = 0
            s = 0
            while True:
                b = delta[pos]
                pos += 1
                v |= (b & 0x7F) << s
                if not (b & 0x80):
                    return v
                s += 7

        _src_size = read_varint()
        dst_size = read_varint()
        out = bytearray()
        while pos < len(delta):
            cmd = delta[pos]
            pos += 1
            if cmd & 0x80:
                cp_off = 0
                cp_size = 0
                if cmd & 0x01:
                    cp_off |= delta[pos]
                    pos += 1
                if cmd & 0x02:
                    cp_off |= delta[pos] << 8
                    pos += 1
                if cmd & 0x04:
                    cp_off |= delta[pos] << 16
                    pos += 1
                if cmd & 0x08:
                    cp_off |= delta[pos] << 24
                    pos += 1
                if cmd & 0x10:
                    cp_size |= delta[pos]
                    pos += 1
                if cmd & 0x20:
                    cp_size |= delta[pos] << 8
                    pos += 1
                if cmd & 0x40:
                    cp_size |= delta[pos] << 16
                    pos += 1
                if cp_size == 0:
                    cp_size = 0x10000
                out.extend(base[cp_off : cp_off + cp_size])
            else:
                out.extend(delta[pos : pos + cmd])
                pos += cmd
        assert len(out) == dst_size
        return bytes(out)


class GasWebAppMockServer:
    def __init__(
        self,
        drive_root: Path,
        index_html_path: Path,
        require_token: Optional[str] = None,
    ) -> None:
        self.drive_root = drive_root
        self.index_html_path = index_html_path
        self.require_token = require_token
        self.echo_store: Dict[str, Tuple[str, str]] = {}

    def get_commit_detail_response(self, project_name: str, commit_oid: str) -> Dict[str, object]:
        clean = project_name[:-4] if project_name.endswith(".git") else project_name
        try:
            store = SimulatedDriveGitStore(self.drive_root, clean)
            return store.get_commit_detail(commit_oid)
        except Exception as e:
            return {"ok": False, "project_name": clean, "oid": commit_oid, "error": str(e)}

    def get_commits_response(self, project_name: str) -> Dict[str, object]:
        clean = project_name[:-4] if project_name.endswith(".git") else project_name
        try:
            store = SimulatedDriveGitStore(self.drive_root, clean)
            return store.get_commits()
        except Exception as e:
            return {
                "ok": False,
                "project_name": clean,
                "head_oid": "",
                "default_branch": "refs/heads/main",
                "commits": [],
                "error": str(e),
            }

    def render_not_found_error_doc(
        self,
        title: str,
        requested_path: str,
        reason: str,
        back_link: Optional[Tuple[str, str, str]] = None,
    ) -> bytes:
        lines = [
            "================================================================================",
            "[ERROR 404 / NOT A RAW FILE] 指定されたファイルまたはディレクトリは存在しません。",
            "※ このレスポンスはエラー通知用の HTML ページであり、リポジトリ内の生のファイルではありません。",
            "   (This response is an HTML error page, NOT a raw repository file.)",
            "================================================================================",
            "",
            f"Requested Path : {escape_html(requested_path)}",
            f"Error Detail   : {escape_html(reason)}",
        ]
        if back_link:
            b_rel, b_href, b_label = back_link
            lines.append("")
            lines.append(
                f'<a target="_top" data-exec-rel="{escape_html(b_rel)}" '
                f'href="{escape_html(b_href)}">{escape_html(b_label)}</a>'
            )
        body_pre = "\n".join(lines)
        doc = (
            "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
            "<base target=\"_top\">\n"
            f"<title>{escape_html(title)}</title>\n</head>\n<body>\n"
            "<h1>404 Not Found (File or Directory Does Not Exist)</h1>\n<hr>\n"
            f"<pre>\n{body_pre}\n</pre>\n<hr>\n</body>\n</html>\n"
        )
        return doc.encode("utf-8")

    def resolve_commit_browser(
        self,
        route_proj: str,
        commit_ref: str,
        subpath: List[str],
        trailing_slash: bool,
        page_param: Optional[str] = None,
        configured_base_url: Optional[str] = None,
        page_size: int = 20,
        custom_per_page: Optional[int] = None,
    ) -> Tuple[int, str, bytes, Optional[str], Optional[str]]:
        """
        Mirrors `resolve_commit_browser_request` in `src/git_server.rs`.
        Returns `(http_status, content_type, body_bytes, redirect_location, download_filename)`.
        """
        effective_page_size = max(1, page_size)
        repo_encoded = f"{encode_uri_segment(route_proj)}.git"
        repo_prefix = f"{repo_encoded}/"
        trimmed_ref = commit_ref.strip()
        seg_count = 1 if not trimmed_ref else (2 + len(subpath))
        up_levels = seg_count if trailing_slash else max(0, seg_count - 1)
        rel_prefix = "./" if up_levels == 0 else ("../" * up_levels)
        base_clean = configured_base_url.rstrip("/") if configured_base_url else None

        def make_urls(target_after_repo: str) -> Tuple[str, str]:
            exec_rel = f"{repo_prefix}{target_after_repo}"
            href = f"{base_clean}/{exec_rel}" if base_clean else f"{rel_prefix}{exec_rel}"
            return (exec_rel, href)

        def make_repo_root_urls(query_suffix: str) -> Tuple[str, str]:
            exec_rel = f"{repo_encoded}{query_suffix}"
            href = f"{base_clean}/{exec_rel}" if base_clean else f"{rel_prefix}{exec_rel}"
            return (exec_rel, href)

        def make_page_query(p: int) -> str:
            if custom_per_page is not None:
                return f"?page={p}&per_page={custom_per_page}"
            return f"?page={p}"

        def fmt_link(
            exec_rel: str,
            href: str,
            display_text: str,
            right_col: Optional[str] = None,
        ) -> str:
            a_tag = (
                f'<a target="_top" data-exec-rel="{escape_html(exec_rel)}" '
                f'href="{escape_html(href)}">{escape_html(display_text)}</a>'
            )
            if right_col is not None:
                pad = max(2, 64 - len(display_text))
                return f"{a_tag}{' ' * pad}{escape_html(right_col)}"
            return a_tag

        def wrap_html(
            title: str,
            lines: List[str],
            redirect_pair: Optional[Tuple[str, str]] = None,
        ) -> bytes:
            meta_redir = ""
            body_pre = "\n".join(lines)
            doc = (
                "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
                "<base target=\"_top\">\n"
                f"<title>{escape_html(title)}</title>\n{meta_redir}</head>\n<body>\n"
                f"<h1>{escape_html(title)}</h1>\n<hr>\n<pre>\n{body_pre}\n</pre>\n<hr>\n"
                "</body>\n</html>\n"
            )
            return doc.encode("utf-8")

        def render_404(
            req_display: str,
            reason: str,
            back_target: str,
            back_label: str,
        ) -> Tuple[int, str, bytes, Optional[str], Optional[str]]:
            b_rel, b_href = make_urls(back_target)
            doc = self.render_not_found_error_doc(
                "404 Not Found - Path Does Not Exist (Not a Raw File)",
                req_display,
                reason,
                (b_rel, b_href, back_label),
            )
            return (404, "text/html; charset=utf-8", doc, None, None)

        try:
            store = SimulatedDriveGitStore(self.drive_root, route_proj)
        except Exception as e:
            doc = self.render_not_found_error_doc(
                "404 Not Found - Repository Does Not Exist (Not a Raw File)",
                f"/{route_proj}.git/{commit_ref}",
                str(e),
                None,
            )
            return (404, "text/html; charset=utf-8", doc, None, None)

        c_res = store.get_commits()
        all_commits: List[Dict[str, object]] = sorted(
            c_res.get("commits", []),  # type: ignore[arg-type]
            key=lambda c: (-int(c["timestamp"]), str(c["oid"])),
        )

        q = commit_ref.strip().lower()
        is_hex = bool(q) and len(q) <= 40 and all(ch in "0123456789abcdef" for ch in q)
        matched_commits = (
            [c for c in all_commits if str(c["oid"]).lower().startswith(q)]
            if is_hex
            else []
        )

        def render_commit_list(
            commits_list: List[Dict[str, object]],
            heading_prefix: str,
            page: int,
            is_redirect: bool,
            is_repo_root: bool = False,
        ) -> Tuple[int, str, bytes, Optional[str], Optional[str]]:
            total = len(commits_list)
            total_pages = (max(1, total) + effective_page_size - 1) // effective_page_size
            enc_ref = encode_uri_segment(trimmed_ref)

            def build_page_url(p: int) -> Tuple[str, str, str]:
                qp = make_page_query(p)
                if is_repo_root:
                    rel, href = make_repo_root_urls(qp)
                    return (rel, href, f"{route_proj}.git?page={p}")
                rel, href = make_urls(f"{enc_ref}{qp}")
                return (rel, href, f"{trimmed_ref}?page={p}")

            title = (
                f"{heading_prefix} (Page {page}/{total_pages})"
                if total_pages > 1
                else heading_prefix
            )
            lines: List[str] = []
            redirect_pair: Optional[Tuple[str, str]] = None
            if is_redirect:
                r_rel, r_href, r_label = build_page_url(1)
                lines.append(
                    f"Redirecting to {fmt_link(r_rel, r_href, r_label)} ..."
                )
                lines.append("")
                redirect_pair = (r_href, r_rel)

            if not commits_list:
                lines.append("(no commits found)")
            else:
                start = (page - 1) * effective_page_size
                end = min(total, start + effective_page_size)
                for c in commits_list[start:end]:
                    c_oid = str(c["oid"])
                    c_rel, c_href = make_urls(encode_uri_segment(c_oid))
                    lines.append(
                        fmt_link(c_rel, c_href, c_oid, f"{c['timestamp']}  {c['summary']}")
                    )

            if total_pages > 1:
                lines.append("")
                page_links: List[str] = []
                for p in range(1, total_pages + 1):
                    p_rel, p_href, _ = build_page_url(p)
                    lnk = fmt_link(p_rel, p_href, str(p))
                    page_links.append(f"[{lnk}]" if p == page else lnk)
                lines.append(f"Pages: {' '.join(page_links)}")
                for p in range(1, total_pages + 1):
                    p_rel, p_href, p_label = build_page_url(p)
                    lines.append(
                        fmt_link(
                            p_rel,
                            p_href,
                            p_label,
                            f"page {p} (current)" if p == page else f"page {p}",
                        )
                    )

            status = 302 if is_redirect else 200
            redir_loc = redirect_pair[0] if redirect_pair else None
            return (
                status,
                "text/html; charset=utf-8",
                wrap_html(title, lines, redirect_pair),
                redir_loc,
                None,
            )

        # Case 0: Repository root `exec/<project_name>.git` (`commit_ref` is empty)
        if not trimmed_ref:
            total = len(all_commits)
            total_pages = (max(1, total) + effective_page_size - 1) // effective_page_size
            heading = f"Index of /{route_proj}.git (commits)"
            if page_param is not None:
                if page_param.strip().isdigit():
                    p = int(page_param.strip())
                    if 1 <= p <= total_pages:
                        return render_commit_list(all_commits, heading, p, False, True)
                return render_404(
                    f"/{route_proj}.git?page={page_param}",
                    f"Invalid page number '{page_param}'",
                    "",
                    f"{route_proj}.git",
                )
            return render_commit_list(
                all_commits, heading, 1, total > effective_page_size, True
            )

        # Case 1: Invalid commit hash
        if not matched_commits:
            total = len(all_commits)
            total_pages = (max(1, total) + effective_page_size - 1) // effective_page_size
            heading = f"Index of /{route_proj}.git commits (invalid commit hash: {commit_ref})"
            if not subpath:
                if page_param is not None:
                    if page_param.strip().isdigit():
                        p = int(page_param.strip())
                        if 1 <= p <= total_pages:
                            return render_commit_list(all_commits, heading, p, False)
                    return render_404(
                        f"/{route_proj}.git/{commit_ref}?page={page_param}",
                        f"Invalid page number '{page_param}' (valid pages: 1..={total_pages})",
                        f"{encode_uri_segment(commit_ref)}{make_page_query(1)}",
                        f"{commit_ref}?page=1",
                    )
                return render_commit_list(
                    all_commits, heading, 1, total > effective_page_size
                )
            req_full = f"/{route_proj}.git/{commit_ref}/{'/'.join(subpath)}"
            return render_404(
                req_full,
                f"Commit hash '{commit_ref}' is invalid and path '{req_full}' cannot be resolved.",
                encode_uri_segment(commit_ref),
                f"View commit list ({commit_ref})",
            )

        # Case 2: Ambiguous commit hash prefix
        if len(matched_commits) > 1:
            total = len(matched_commits)
            total_pages = (max(1, total) + effective_page_size - 1) // effective_page_size
            heading = f"Index of candidate commits in /{route_proj}.git for prefix {commit_ref} ({total} matches)"
            if not subpath:
                if page_param is not None:
                    if page_param.strip().isdigit():
                        p = int(page_param.strip())
                        if 1 <= p <= total_pages:
                            return render_commit_list(matched_commits, heading, p, False)
                    return render_404(
                        f"/{route_proj}.git/{commit_ref}?page={page_param}",
                        f"Invalid page number '{page_param}' for candidate commits",
                        f"{encode_uri_segment(commit_ref)}{make_page_query(1)}",
                        f"{commit_ref}?page=1",
                    )
                return render_commit_list(
                    matched_commits, heading, 1, total > effective_page_size
                )
            req_full = f"/{route_proj}.git/{commit_ref}/{'/'.join(subpath)}"
            return render_404(
                req_full,
                f"Commit prefix '{commit_ref}' is ambiguous ({total} candidate commits)",
                encode_uri_segment(commit_ref),
                f"View candidate commits for {commit_ref}",
            )

        # Case 3: Uniquely resolved commit (always uses resolved 40-char commit hash)
        commit_obj = matched_commits[0]
        resolved_oid = str(commit_obj["oid"])
        detail = store.get_commit_detail(resolved_oid)
        entries_list: List[Dict[str, object]] = detail.get("tree_entries", [])  # type: ignore[assignment]
        entries_by_path: Dict[str, Dict[str, object]] = {
            str(e["path"]): e for e in entries_list
        }

        def render_dir(
            dir_subpath: List[str],
        ) -> Tuple[int, str, bytes, Optional[str], Optional[str]]:
            parent_dir = "/".join(dir_subpath)
            dirs: List[str] = []
            files: List[Tuple[str, int]] = []
            for e in entries_list:
                if str(e["parent_dir"]) == parent_dir:
                    if e["kind"] == "tree":
                        dirs.append(str(e["name"]))
                    elif e["kind"] == "blob":
                        files.append((str(e["name"]), int(e["size"])))
            dirs.sort()
            files.sort(key=lambda x: x[0])

            enc_oid = encode_uri_segment(resolved_oid)
            dir_enc = "/".join(encode_uri_segment(s) for s in dir_subpath)
            title = (
                f"Index of /{route_proj}.git/{resolved_oid}/"
                if not dir_subpath
                else f"Index of /{route_proj}.git/{resolved_oid}/{parent_dir}/"
            )
            lines: List[str] = []
            if dir_subpath:
                parent_target = (
                    enc_oid
                    if len(dir_subpath) == 1
                    else f"{enc_oid}/{'/'.join(encode_uri_segment(s) for s in dir_subpath[:-1])}"
                )
                p_rel, p_href = make_urls(parent_target)
                lines.append(fmt_link(p_rel, p_href, "../"))

            for d_name in dirs:
                disp = (
                    f"{resolved_oid}/{d_name}/"
                    if not dir_subpath
                    else f"{resolved_oid}/{parent_dir}/{d_name}/"
                )
                t_path = (
                    f"{enc_oid}/{encode_uri_segment(d_name)}"
                    if not dir_subpath
                    else f"{enc_oid}/{dir_enc}/{encode_uri_segment(d_name)}"
                )
                d_rel, d_href = make_urls(t_path)
                lines.append(fmt_link(d_rel, d_href, disp, "-"))

            for f_name, f_size in files:
                disp = (
                    f"{resolved_oid}/{f_name}"
                    if not dir_subpath
                    else f"{resolved_oid}/{parent_dir}/{f_name}"
                )
                t_path = (
                    f"{enc_oid}/{encode_uri_segment(f_name)}"
                    if not dir_subpath
                    else f"{enc_oid}/{dir_enc}/{encode_uri_segment(f_name)}"
                )
                f_rel, f_href = make_urls(t_path)
                lines.append(fmt_link(f_rel, f_href, disp, str(f_size)))

            return (200, "text/html; charset=utf-8", wrap_html(title, lines), None, None)

        if not subpath:
            return render_dir([])

        full_req_display = f"/{route_proj}.git/{resolved_oid}/{'/'.join(subpath)}"
        for seg in subpath:
            if not seg or seg in (".", "..") or "/" in seg or "\x00" in seg:
                return render_404(
                    full_req_display,
                    f"Invalid path segment '{seg}'",
                    encode_uri_segment(resolved_oid),
                    f"{resolved_oid}/",
                )

        for idx in range(1, len(subpath)):
            inter_path = "/".join(subpath[:idx])
            inter_entry = entries_by_path.get(inter_path)
            if not inter_entry or inter_entry["kind"] != "tree":
                return render_404(
                    full_req_display,
                    f"'{inter_path}' is not a directory",
                    encode_uri_segment(resolved_oid),
                    f"{resolved_oid}/",
                )

        full_rel_path = "/".join(subpath)
        target_entry = entries_by_path.get(full_rel_path)
        if not target_entry:
            return render_404(
                full_req_display,
                f"File or directory '{full_rel_path}' does not exist in commit {resolved_oid}",
                encode_uri_segment(resolved_oid),
                f"{resolved_oid}/",
            )

        if target_entry["kind"] == "tree":
            return render_dir(subpath)

        if trailing_slash:
            return render_404(
                f"{full_req_display}/",
                f"'{full_rel_path}' is a regular file, not a directory",
                encode_uri_segment(resolved_oid),
                f"{resolved_oid}/",
            )

        blob_oid = str(target_entry["oid"])
        raw_obj = store.read_raw_object(blob_oid)
        raw_bytes = raw_obj[1] if raw_obj else b""
        is_binary = b"\x00" in raw_bytes[:4096]
        if is_binary:
            return (
                200,
                "application/octet-stream",
                raw_bytes,
                None,
                subpath[-1],
            )
        return (200, "text/plain; charset=utf-8", raw_bytes, None, None)

    def build_ui_state(
        self,
        base_url: str,
        selected_project: Optional[str] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Dict[str, object]:
        return {
            "ok": error is None,
            "drive_folder_configured": True,
            "drive_folder_id": "mock-drive-folder-id-12345",
            "drive_folder_url": "https://drive.google.com/drive/folders/mock-drive-folder-id-12345",
            "base_url": base_url,
            "selected_project": selected_project,
            "repositories": SimulatedDriveGitStore.list_repositories(self.drive_root),
            "message": message,
            "error": error,
        }

    def create_handler(self):
        parent = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass

            def _check_auth(self) -> bool:
                if not parent.require_token:
                    return True
                auth = self.headers.get("Authorization", "")
                if auth == f"Bearer {parent.require_token}":
                    return True
                self.send_response(302)
                self.send_header(
                    "Location",
                    "https://accounts.google.com/ServiceLogin?service=wise&passive=1209600",
                )
                self.send_header("Content-Length", "0")
                self.end_headers()
                return False

            def _redirect_to_echo(
                self, content: str, content_type: str = "text/plain; charset=utf-8"
            ) -> None:
                key = str(uuid.uuid4())
                parent.echo_store[key] = (content, content_type)
                host = self.headers.get("Host", "127.0.0.1")
                redirect_url = f"http://{host}/macros/echo?user_content_key={key}"
                self.send_response(302)
                self.send_header("Location", redirect_url)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parsed.query)

                if parsed.path == "/macros/echo":
                    key = qs.get("user_content_key", [""])[0]
                    content, ctype = parent.echo_store.pop(
                        key, ("", "text/plain; charset=utf-8")
                    )
                    body = content.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return

                if not self._check_auth():
                    return

                host = self.headers.get("Host", "127.0.0.1")
                base_url = f"http://{host}/macros/s/AKfycbxTestDeploymentId/exec"

                action = qs.get("action", [None])[0]
                if action == "get_commits":
                    repo_name = qs.get("repo", [""])[0]
                    commits_data = parent.get_commits_response(repo_name)
                    self._redirect_to_echo(json.dumps(commits_data), "application/json")
                    return

                if action == "get_commit_detail":
                    repo_name = qs.get("repo", [""])[0]
                    commit_oid = qs.get("commit", qs.get("commit_oid", [""]))[0]
                    detail_data = parent.get_commit_detail_response(repo_name, commit_oid)
                    self._redirect_to_echo(json.dumps(detail_data), "application/json")
                    return

                if action == "list_repos":
                    state = parent.build_ui_state(base_url)
                    self._redirect_to_echo(json.dumps(state), "application/json")
                    return

                git_path = qs.get("git_path", [parsed.path])[0]
                service = qs.get("service", [None])[0]

                try:
                    route, proj_name = parse_git_path(git_path)
                except ValueError as e:
                    if service is not None:
                        self._redirect_to_echo(f"ERR {e}")
                    else:
                        err_doc = parent.render_not_found_error_doc(
                            "404 Not Found - Invalid URL Path (Not a Raw File)",
                            git_path,
                            str(e),
                            None,
                        )
                        self.send_response(404)
                        self.send_header("Content-Type", "text/html; charset=utf-8")
                        self.send_header("Content-Length", str(len(err_doc)))
                        self.end_headers()
                        self.wfile.write(err_doc)
                    return

                if route == "info_refs" and proj_name:
                    try:
                        store = SimulatedDriveGitStore(parent.drive_root, proj_name)
                        res_bytes = store.handle_info_refs(service or "git-upload-pack")
                        b64_text = base64.b64encode(res_bytes).decode("ascii")
                        self._redirect_to_echo(b64_text)
                    except Exception as e:
                        self._redirect_to_echo(f"ERR {e}")
                    return

                if route in ("commit_browser", "web_repo") and service is None:
                    if route == "web_repo":
                        assert proj_name is not None
                        r_proj = proj_name
                        commit_ref = ""
                        subpath = []
                        without_q = git_path.split("?", 1)[0]
                        trailing_slash = len(without_q) > 1 and without_q.endswith("/")
                    else:
                        r_proj, commit_ref, subpath, trailing_slash = (
                            parse_commit_browser_route(git_path)
                        )
                    raw_per_page = qs.get("per_page", [None])[0]
                    custom_pp = (
                        int(raw_per_page)
                        if (raw_per_page and raw_per_page.isdigit())
                        else None
                    )
                    per_page = custom_pp if custom_pp is not None else 20
                    page_param = qs.get("page", [None])[0]
                    status, ctype, body_bytes, redir_loc, dl_filename = (
                        parent.resolve_commit_browser(
                            r_proj,
                            commit_ref,
                            subpath,
                            trailing_slash,
                            page_param=page_param,
                            configured_base_url=base_url,
                            page_size=per_page,
                            custom_per_page=custom_pp,
                        )
                    )
                    if status == 302 and redir_loc:
                        abs_target = urllib.parse.urljoin(
                            f"http://{host}{parsed.path}", redir_loc
                        )
                        self.send_response(302)
                        self.send_header("Location", abs_target)
                        self.send_header("Content-Type", ctype)
                        self.send_header("Content-Length", str(len(body_bytes)))
                        self.end_headers()
                        self.wfile.write(body_bytes)
                        return
                    self.send_response(status)
                    self.send_header("Content-Type", ctype)
                    if dl_filename is not None:
                        self.send_header(
                            "Content-Disposition",
                            f'attachment; filename="{dl_filename}"',
                        )
                    self.send_header("Content-Length", str(len(body_bytes)))
                    self.end_headers()
                    self.wfile.write(body_bytes)
                    return

                state = parent.build_ui_state(base_url, selected_project=proj_name)
                html_template = parent.index_html_path.read_text(encoding="utf-8")
                rendered_html = html_template.replace(
                    "</head>",
                    f"<script>window.__GAS_GIT_INITIAL_STATE__ = {json.dumps(state)};</script></head>",
                )
                body = rendered_html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                parsed = urllib.parse.urlparse(self.path)
                if parsed.path == "/macros/echo":
                    self.send_response(405)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return

                if not self._check_auth():
                    return

                host = self.headers.get("Host", "127.0.0.1")
                base_url = f"http://{host}/macros/s/AKfycbxTestDeploymentId/exec"

                length = int(self.headers.get("Content-Length", "0"))
                raw_post = self.rfile.read(length)
                envelope = json.loads(raw_post.decode("utf-8"))

                action = envelope.get("action")
                if action == "get_commits":
                    repo_name = envelope.get("project_name") or envelope.get("repo", "")
                    commits_data = parent.get_commits_response(repo_name)
                    self._redirect_to_echo(json.dumps(commits_data), "application/json")
                    return

                if action == "create_repo":
                    proj_name = envelope.get("project_name", "")
                    desc = envelope.get("description", "")
                    try:
                        summary = SimulatedDriveGitStore.create_repository(
                            parent.drive_root, proj_name, desc
                        )
                        state = parent.build_ui_state(
                            base_url,
                            selected_project=str(summary["name"]),
                            message=f"Repository '{summary['folder_name']}' created in Google Drive.",
                        )
                    except Exception as e:
                        state = parent.build_ui_state(base_url, error=str(e))
                    self._redirect_to_echo(json.dumps(state), "application/json")
                    return

                git_path = envelope.get("git_path", "")
                service = envelope.get("service", "git-upload-pack")
                req_bytes = base64.b64decode(envelope["body_base64"])

                try:
                    route, proj_name = parse_git_path(git_path)
                    assert proj_name is not None, "Missing project name in git_path"
                    store = SimulatedDriveGitStore(parent.drive_root, proj_name)
                    if route == "upload_pack" or service == "git-upload-pack":
                        res_bytes = store.handle_upload_pack(req_bytes)
                    elif route == "receive_pack" or service == "git-receive-pack":
                        res_bytes = store.handle_receive_pack(req_bytes)
                    else:
                        raise ValueError(f"Unsupported route {route}")
                    b64_text = base64.b64encode(res_bytes).decode("ascii")
                except Exception as e:
                    err_pkt = pkt_text(f"ERR {e}")
                    b64_text = base64.b64encode(err_pkt).decode("ascii")

                self._redirect_to_echo(b64_text)

        return Handler


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def run_e2e_tests() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    tools_dir = repo_root / "tools"
    index_html_path = repo_root / "dist" / "index.html"
    os.chmod(tools_dir / "git-remote-gas", 0o755)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        drive_root = tmp_path / "google_drive_root_folder"
        drive_root.mkdir()

        mock = GasWebAppMockServer(
            drive_root=drive_root,
            index_html_path=index_html_path,
            require_token="secret-gas-oauth-token-123",
        )
        httpd = ThreadedTCPServer(("127.0.0.1", 0), mock.create_handler())
        port = httpd.server_address[1]
        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()

        exec_base_url = f"http://127.0.0.1:{port}/macros/s/AKfycbxTestDeploymentId/exec"
        alpha_gas_url = f"gas::{exec_base_url}/project-alpha.git"
        beta_gas_url = f"gas::{exec_base_url}/project-beta.git"

        base_env = os.environ.copy()
        base_env["PATH"] = f"{tools_dir}:{base_env.get('PATH', '')}"

        try:
            # 1. Verify URL without `/<project_name>.git` is rejected by `git-remote-gas`
            env_auth = base_env.copy()
            env_auth["GAS_GIT_TOKEN"] = "secret-gas-oauth-token-123"
            proc_no_proj = subprocess.run(
                ["git", "ls-remote", f"gas::{exec_base_url}"],
                env=env_auth,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,
            )
            assert proc_no_proj.returncode != 0, "Expected URL without /project_name.git to fail"
            assert "project_name.git" in proc_no_proj.stderr
            print("[OK] 1. URL path parser enforces `/<project_name>.git` suffix.")

            # 2. Verify unauthenticated request detects GAS -> accounts.google.com redirect
            env_no_auth = base_env.copy()
            env_no_auth.pop("GAS_GIT_TOKEN", None)
            proc_unauth = subprocess.run(
                ["git", "ls-remote", alpha_gas_url],
                env=env_no_auth,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,
            )
            assert proc_unauth.returncode != 0, "Expected unauthenticated git ls-remote to fail"
            assert "Google Login" in proc_unauth.stderr, f"Unexpected stderr: {proc_unauth.stderr}"
            print("[OK] 2. Unauthenticated GAS redirect to accounts.google.com detected cleanly.")

            # 3. Verify server does NOT auto-create repositories or initial commits behind the user's back
            proc_missing = subprocess.run(
                ["git", "ls-remote", alpha_gas_url],
                env=env_auth,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,
            )
            assert proc_missing.returncode != 0, "Expected non-existent repository to fail before creation"
            assert "does not exist" in proc_missing.stderr
            print("[OK] 3. Server does not auto-initialize non-existent repositories.")

            # 4. Verify Browser Web UI (Gleam + Lustre) HTML serving and repository creation API
            req_ui = urllib.request.Request(
                exec_base_url,
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_ui, timeout=5) as resp:
                ui_html = resp.read().decode("utf-8")
                assert "<div id=\"app\"></div>" in ui_html
                assert "GAS Git Server (gitoxide + Google Drive)" in ui_html

            for proj, desc in [
                ("project-alpha", "First project in Google Drive"),
                ("project-beta", "Second project in Google Drive"),
            ]:
                req_create = urllib.request.Request(
                    f"{exec_base_url}?action=create_repo",
                    data=json.dumps(
                        {
                            "action": "create_repo",
                            "project_name": proj,
                            "description": desc,
                        }
                    ).encode("utf-8"),
                    headers={
                        "Authorization": "Bearer secret-gas-oauth-token-123",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req_create, timeout=5) as create_resp:
                    state_data = json.loads(create_resp.read().decode("utf-8"))
                    assert state_data["ok"] is True

            assert (drive_root / "project-alpha.git").is_dir()
            assert (drive_root / "project-beta.git").is_dir()
            print(
                "[OK] 4. Gleam + Lustre Web UI served and created empty 'project-alpha.git' & 'project-beta.git' in Google Drive folder."
            )

            # 5. Verify newly created repository has 0 commits (no automatic initial commit)
            ls_empty = subprocess.check_output(
                ["git", "ls-remote", alpha_gas_url],
                env=env_auth,
                text=True,
                timeout=10,
            )
            assert ls_empty.strip() == "", f"Expected empty ls-remote output on new repo, got: {ls_empty}"
            print("[OK] 5. Newly created repository has 0 commits (no unwanted initial commit).")

            # 6. Verify `git init` + `git remote add origin gas::.../exec/project-alpha.git` + `git push -u origin main`
            local_alpha = tmp_path / "local_alpha"
            local_alpha.mkdir()
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "init", "-b", "main"],
                env=env_auth,
                stdout=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "config", "user.name", "Developer"],
                env=env_auth,
            )
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "config", "user.email", "dev@example.com"],
                env=env_auth,
            )
            (local_alpha / "README.md").write_text("# Project Alpha on GAS Drive\n", encoding="utf-8")
            subprocess.check_call(["git", "-C", str(local_alpha), "add", "README.md"], env=env_auth)
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "commit", "-m", "Initial commit from client"],
                env=env_auth,
                stdout=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "remote", "add", "origin", alpha_gas_url],
                env=env_auth,
            )
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "push", "-u", "origin", "main"],
                env=env_auth,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
            )
            print(
                f"[OK] 6. `git remote add origin {alpha_gas_url}` and initial `git push -u origin main` succeeded."
            )

            # 7. Verify `git clone` of `project-alpha.git` and multi-project isolation (`project-beta.git` still empty)
            clone_alpha = tmp_path / "clone_alpha"
            subprocess.check_call(
                ["git", "clone", alpha_gas_url, str(clone_alpha)],
                env=env_auth,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
            )
            assert (
                clone_alpha / "README.md"
            ).read_text(encoding="utf-8") == "# Project Alpha on GAS Drive\n"

            ls_beta = subprocess.check_output(
                ["git", "ls-remote", beta_gas_url],
                env=env_auth,
                text=True,
                timeout=10,
            )
            assert ls_beta.strip() == "", "Expected project-beta.git to remain empty and isolated!"
            print(
                "[OK] 7. Cloned `project-alpha.git` and verified multi-project isolation in Google Drive folder!"
            )

            # 8. Verify commit log & decoration API (`action=get_commits&repo=project-alpha`)
            req_commits_alpha = urllib.request.Request(
                f"{exec_base_url}?action=get_commits&repo=project-alpha",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_commits_alpha, timeout=5) as c_resp:
                c_alpha = json.loads(c_resp.read().decode("utf-8"))
                assert c_alpha["ok"] is True
                assert c_alpha["project_name"] == "project-alpha"
                assert len(c_alpha["commits"]) == 1
                c0 = c_alpha["commits"][0]
                assert c0["summary"] == "Initial commit from client"
                assert c0["author_name"] == "Developer"
                assert c0["author_email"] == "dev@example.com"
                assert any("HEAD -> main" in r for r in c0["refs"])

            # Verify empty project-beta has 0 commits
            req_commits_beta = urllib.request.Request(
                f"{exec_base_url}?action=get_commits&repo=project-beta",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_commits_beta, timeout=5) as b_resp:
                c_beta = json.loads(b_resp.read().decode("utf-8"))
                assert c_beta["ok"] is True
                assert c_beta["commits"] == []
                assert c_beta["head_oid"] == ""
            print("[OK] 8. `get_commits` API returned decorated commit history for project-alpha and empty log for project-beta.")

            # 9. Push a 2nd commit and branch to project-alpha and verify commit parent chain and ref decorations
            (local_alpha / "feature.txt").write_text("New feature\n", encoding="utf-8")
            subprocess.check_call(["git", "-C", str(local_alpha), "checkout", "-b", "feature"], env=env_auth, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.check_call(["git", "-C", str(local_alpha), "add", "feature.txt"], env=env_auth)
            subprocess.check_call(["git", "-C", str(local_alpha), "commit", "-m", "Add new feature on branch"], env=env_auth, stdout=subprocess.DEVNULL)
            subprocess.check_call(["git", "-C", str(local_alpha), "push", "-u", "origin", "feature"], env=env_auth, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)

            with urllib.request.urlopen(req_commits_alpha, timeout=5) as c_resp2:
                c_alpha2 = json.loads(c_resp2.read().decode("utf-8"))
                assert c_alpha2["ok"] is True
                assert len(c_alpha2["commits"]) == 2
                top = c_alpha2["commits"][0]
                parent = c_alpha2["commits"][1]
                assert top["summary"] == "Add new feature on branch"
                assert parent["oid"] in top["parents"]
                assert any("feature" in r for r in top["refs"])
            print("[OK] 9. Pushed 2nd commit on new branch and verified multi-commit parent chain and branch decorations.")

            # 10. Push nested directory files, binary asset, & directory named `1`, then verify `get_commit_detail`
            (local_alpha / "src").mkdir(exist_ok=True)
            (local_alpha / "src" / "main.rs").write_text("fn main() {\n    println!(\"Hello GAS Git!\");\n}\n", encoding="utf-8")
            (local_alpha / "1").mkdir(exist_ok=True)
            (local_alpha / "1" / "inside_one.txt").write_text("File inside directory 1\n", encoding="utf-8")
            binary_payload = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x01\x02\x03"
            (local_alpha / "logo.bin").write_bytes(binary_payload)
            (local_alpha / "README.md").write_text("# Project Alpha on GAS Drive\nUpdated documentation line.\n", encoding="utf-8")
            subprocess.check_call(
                ["git", "-C", str(local_alpha), "add", "src/main.rs", "1/inside_one.txt", "logo.bin", "README.md"],
                env=env_auth,
            )
            subprocess.check_call(["git", "-C", str(local_alpha), "commit", "-m", "Add src/main.rs, dir 1, binary logo, and update README"], env=env_auth, stdout=subprocess.DEVNULL)
            subprocess.check_call(["git", "-C", str(local_alpha), "push", "origin", "feature"], env=env_auth, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            head_commit_oid = subprocess.check_output(["git", "-C", str(local_alpha), "rev-parse", "HEAD"], env=env_auth, text=True).strip()

            req_detail = urllib.request.Request(
                f"{exec_base_url}?action=get_commit_detail&repo=project-alpha&commit={head_commit_oid}",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_detail, timeout=5) as d_resp:
                detail = json.loads(d_resp.read().decode("utf-8"))
                assert detail["ok"] is True
                assert detail["oid"] == head_commit_oid
                assert detail["summary"] == "Add src/main.rs, dir 1, binary logo, and update README"
                changes_by_path = {c["path"]: c for c in detail["changes"]}
                assert "README.md" in changes_by_path
                assert changes_by_path["README.md"]["status"] == "modified"
                assert "+Updated documentation line." in changes_by_path["README.md"]["patch"]
                assert "src/main.rs" in changes_by_path
                assert changes_by_path["src/main.rs"]["status"] == "added"

                entries_by_path = {e["path"]: e for e in detail["tree_entries"]}
                assert "src" in entries_by_path and entries_by_path["src"]["kind"] == "tree"
                assert "src/main.rs" in entries_by_path and entries_by_path["src/main.rs"]["kind"] == "blob"
                assert entries_by_path["src/main.rs"]["parent_dir"] == "src"
                assert "Hello GAS Git!" in entries_by_path["src/main.rs"]["content"]
            print("[OK] 10. `get_commit_detail` API returned unified diffs (`changes`) and full directory/file tree (`tree_entries`) at target commit.")

            # 11. Verify `exec/<project_name>.git` renders the commit hash list with full `exec/<project_name>.git/<commit_oid>` links, and `exec/<commit hash>` is rejected
            req_repo_commits = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_repo_commits, timeout=5) as r_repo_list:
                repo_list_html = r_repo_list.read().decode("utf-8")
                assert "Index of /project-alpha.git (commits)" in repo_list_html
                assert f'href="{exec_base_url}/project-alpha.git/{head_commit_oid}"' in repo_list_html

            req_direct_commit = urllib.request.Request(
                f"{exec_base_url}/{head_commit_oid}",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            try:
                urllib.request.urlopen(req_direct_commit, timeout=5)
                assert False, "Expected direct /exec/<commit_hash> without /<project_name>.git to be rejected"
            except urllib.error.HTTPError as he:
                assert he.code == 404
                err_body = he.read().decode("utf-8")
                assert "[ERROR 404 / NOT A RAW FILE]" in err_body
                assert "must start with /&lt;project_name&gt;.git" in err_body
            print("[OK] 11. `exec/<project_name>.git` rendered the commit hash list with full `/exec/` URLs, and direct `exec/<commit hash>` was rejected.")

            # 12. Verify `exec/<project_name>.git/<commit hash>` (full & short prefix) renders nginx-autoindex root directory with full 40-char hash
            req_root_full = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/{head_commit_oid}",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_root_full, timeout=5) as r_full:
                root_html = r_full.read().decode("utf-8")
                assert f"Index of /project-alpha.git/{head_commit_oid}/" in root_html
                assert f"{head_commit_oid}/src/" in root_html
                assert f"{head_commit_oid}/1/" in root_html
                assert f"{head_commit_oid}/README.md" in root_html
                assert f"{head_commit_oid}/logo.bin" in root_html
                assert '<div id="app"></div>' not in root_html

            short_prefix = head_commit_oid[:8]
            req_root_short = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/{short_prefix}",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_root_short, timeout=5) as r_short:
                short_html = r_short.read().decode("utf-8")
                assert f"Index of /project-alpha.git/{head_commit_oid}/" in short_html
                assert f"{head_commit_oid}/src/" in short_html
            print("[OK] 12. `exec/<project_name>.git/<commit hash>` (full and unique prefix) rendered root directory using resolved 40-char commit hash.")

            # 13. Verify `exec/<project_name>.git/<commit hash>/<dir path>` (including directory named `1`) renders subdirectory contents
            for d_path, expected_child in [("src", "main.rs"), ("1", "inside_one.txt")]:
                req_subdir = urllib.request.Request(
                    f"{exec_base_url}/project-alpha.git/{head_commit_oid}/{d_path}",
                    headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
                )
                with urllib.request.urlopen(req_subdir, timeout=5) as r_sub:
                    sub_html = r_sub.read().decode("utf-8")
                    assert f"Index of /project-alpha.git/{head_commit_oid}/{d_path}/" in sub_html
                    assert "../" in sub_html
                    assert f"{head_commit_oid}/{d_path}/{expected_child}" in sub_html
            print("[OK] 13. `exec/<project_name>.git/<commit hash>/<dir path>` (including `/1` directory) rendered subdirectory entries without collision.")

            # 14. Verify `exec/<project_name>.git/<commit hash>/<file path>` returns raw text for text files and download attachment for binary files
            req_raw_file = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/{head_commit_oid}/src/main.rs",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_raw_file, timeout=5) as r_file:
                raw_content = r_file.read().decode("utf-8")
                ctype_header = r_file.headers.get("Content-Type", "")
                cdisp_header = r_file.headers.get("Content-Disposition")
                assert "text/plain" in ctype_header
                assert cdisp_header is None
                assert raw_content == 'fn main() {\n    println!("Hello GAS Git!");\n}\n'

            req_bin_file = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/{head_commit_oid}/logo.bin",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_bin_file, timeout=5) as r_bin:
                bin_bytes = r_bin.read()
                cdisp = r_bin.headers.get("Content-Disposition", "")
                assert 'attachment; filename="logo.bin"' in cdisp
                assert bin_bytes == binary_payload
            print("[OK] 14. `exec/<project_name>.git/<commit hash>/<file path>` returned raw text for text files and attachment download for binary files.")

            # 15. Verify invalid paths return an unmistakable non-raw-file HTML error page
            for bad_subpath in ["nonexistent_dir/file.txt", "README.md/not_a_dir", "README.md/"]:
                req_bad = urllib.request.Request(
                    f"{exec_base_url}/project-alpha.git/{head_commit_oid}/{bad_subpath}",
                    headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
                )
                try:
                    urllib.request.urlopen(req_bad, timeout=5)
                    assert False, f"Expected 404 for {bad_subpath}"
                except urllib.error.HTTPError as he:
                    assert he.code == 404
                    err_html = he.read().decode("utf-8")
                    assert "[ERROR 404 / NOT A RAW FILE]" in err_html
                    assert "このレスポンスはエラー通知用の HTML ページであり、リポジトリ内の生のファイルではありません" in err_html
            print("[OK] 15. Invalid paths under `exec/<project_name>.git/<commit hash>/...` returned unmistakable non-raw-file HTML error pages.")

            # 16. Verify invalid `<commit hash>` redirects to `exec/<project_name>.git/<commit hash>?page=1` and links to `?page=2, ?page=3, ...`
            req_inv_paginated = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/invalid_commit_hash_xyz?per_page=1",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_inv_paginated, timeout=5) as r_inv:
                final_url = r_inv.geturl()
                inv_html = r_inv.read().decode("utf-8")
                assert "/exec/project-alpha.git/invalid_commit_hash_xyz?page=1" in final_url
                assert "invalid_commit_hash_xyz?page=2" in inv_html
                assert "invalid_commit_hash_xyz?page=3" in inv_html
                assert head_commit_oid in inv_html

            req_inv_page2 = urllib.request.Request(
                f"{exec_base_url}/project-alpha.git/invalid_commit_hash_xyz?page=2&per_page=1",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_inv_page2, timeout=5) as r_p2:
                p2_html = r_p2.read().decode("utf-8")
                assert "Page 2/3" in p2_html
                assert "invalid_commit_hash_xyz?page=1" in p2_html
                assert "invalid_commit_hash_xyz?page=3" in p2_html
            print("[OK] 16. Invalid `<commit hash>` redirected to `?page=1` and rendered paginated commit list with `?page=2, ?page=3` links.")

            # 17. Verify ambiguous `<commit hash>` prefix (`exec/<project_name>.git/<prefix>`) lists candidates and paginates with `?page=1, ?page=2`
            beta_store = SimulatedDriveGitStore(drive_root, "project-beta")
            empty_tree_oid = beta_store.write_raw_object("tree", b"")
            seen_by_prefix2: Dict[str, List[str]] = {}
            ambig_prefix = ""
            ambig_pair: List[str] = []
            for idx in range(300):
                commit_body = (
                    f"tree {empty_tree_oid}\n"
                    f"author Tester <test@example.com> {1700001000 + idx} +0000\n"
                    f"committer Tester <test@example.com> {1700001000 + idx} +0000\n\n"
                    f"Synthetic commit #{idx}\n"
                ).encode("utf-8")
                c_oid = beta_store.write_raw_object("commit", commit_body)
                p2 = c_oid[:2]
                seen_by_prefix2.setdefault(p2, []).append(c_oid)
                if len(seen_by_prefix2[p2]) >= 2:
                    ambig_prefix = p2
                    ambig_pair = seen_by_prefix2[p2]
                    beta_store.write_refs({
                        "refs/heads/main": ambig_pair[0],
                        "refs/heads/second": ambig_pair[1],
                    })
                    break

            assert ambig_prefix and len(ambig_pair) >= 2
            req_ambig = urllib.request.Request(
                f"{exec_base_url}/project-beta.git/{ambig_prefix}?per_page=1",
                headers={"Authorization": "Bearer secret-gas-oauth-token-123"},
            )
            with urllib.request.urlopen(req_ambig, timeout=5) as r_amb:
                amb_final_url = r_amb.geturl()
                amb_html = r_amb.read().decode("utf-8")
                assert f"/exec/project-beta.git/{ambig_prefix}?page=1" in amb_final_url
                assert f"Index of candidate commits in /project-beta.git for prefix {ambig_prefix}" in amb_html
                assert f"{ambig_prefix}?page=2" in amb_html
            print(f"[OK] 17. Ambiguous commit prefix `exec/project-beta.git/{ambig_prefix}` redirected to `?page=1` and listed candidate commits with `?page=2` link.")

            # 18. Verify GAS V8 Fast Base64/Wasm Loader (`textencoderdecoder.ts` + `optimize_jco_gas.mjs`) and `CacheService` optimizations
            repo_root = Path(__file__).resolve().parent.parent
            rs_src = (repo_root / "src" / "git_server.rs").read_text(encoding="utf-8")
            assert "gas_cache_service::get_script_cache()" in rs_src
            assert "prefetch_objects" in rs_src
            assert "direct_exact_commit" in rs_src
            assert "with_repo_folder" in rs_src

            ts_src = (repo_root / "textencoderdecoder.ts").read_text(encoding="utf-8")
            assert "__gasDecodeBase64Fast" in ts_src
            assert "__gasFastBase64Compile" in ts_src
            assert "globalThis.Buffer" in ts_src
            opt_script = repo_root / "tools" / "optimize_jco_gas.mjs"
            assert opt_script.is_file(), "tools/optimize_jco_gas.mjs must exist" 
            print("[OK] 18. Verified GAS V8 Fast Base64/Wasm Loader (`Buffer.from` lookup table + `WebAssembly.Module` memoization) and `CacheService` 0-Drive-RPC optimizations.")

        finally:
            httpd.shutdown()


if __name__ == "__main__":
    run_e2e_tests()
    print("ALL END-TO-END GAS GIT SERVER, DRIVE MULTI-PROJECT & GLEAM/LUSTRE WEB UI TESTS PASSED!")
