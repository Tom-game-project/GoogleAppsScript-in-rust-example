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


def parse_git_path(raw_path: str) -> Tuple[str, Optional[str]]:
    """
    Mirrors `parse_git_path` in `src/git_server.rs`:
      - `/` -> ("web_root", None)
      - `/<project_name>.git` -> ("web_repo", project_name)
      - `/<project_name>.git/info/refs` -> ("info_refs", project_name)
      - `/<project_name>.git/git-upload-pack` -> ("upload_pack", project_name)
      - `/<project_name>.git/git-receive-pack` -> ("receive_pack", project_name)
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

    def norm_proj(seg: str) -> str:
        name = seg[:-4] if seg.endswith(".git") else seg
        if not name or name in (".", ".."):
            raise ValueError(f"Invalid repository name '{seg}'")
        return name

    if len(segments) == 3 and segments[1] == "info" and segments[2] == "refs":
        return ("info_refs", norm_proj(segments[0]))
    if len(segments) == 2 and segments[1] == "git-upload-pack":
        return ("upload_pack", norm_proj(segments[0]))
    if len(segments) == 2 and segments[1] == "git-receive-pack":
        return ("receive_pack", norm_proj(segments[0]))
    if segments in (["info", "refs"], ["git-upload-pack"], ["git-receive-pack"]):
        raise ValueError("Missing repository name in URL path")
    if len(segments) == 1:
        return ("web_repo", norm_proj(segments[0]))

    raise ValueError(f"Unsupported Git URL path '/{'/'.join(segments)}'")


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
                if action == "list_repos":
                    state = parent.build_ui_state(base_url)
                    self._redirect_to_echo(json.dumps(state), "application/json")
                    return

                git_path = qs.get("git_path", [parsed.path])[0]
                service = qs.get("service", [None])[0]

                try:
                    route, proj_name = parse_git_path(git_path)
                except ValueError as e:
                    self._redirect_to_echo(f"ERR {e}")
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

        finally:
            httpd.shutdown()


if __name__ == "__main__":
    run_e2e_tests()
    print("ALL END-TO-END GAS GIT SERVER, DRIVE MULTI-PROJECT & GLEAM/LUSTRE WEB UI TESTS PASSED!")
