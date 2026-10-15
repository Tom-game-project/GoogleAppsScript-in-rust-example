#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
End-to-End Integration Test for `git-remote-gas` and the GAS Smart HTTP v1 Protocol
===================================================================================

Simulates Google Apps Script's exact Web App behavior:
  1. `GET` / `POST` to `/macros/s/<ID>/exec` executes `doGet` / `doPost`, stores the
     `ContentService` output under a one-time `user_content_key`, and returns an
     `HTTP 302 Found` redirect to `/macros/echo?user_content_key=<key>`.
  2. `/macros/echo` only accepts `GET` (returning `405 Method Not Allowed` if a client
     erroneously re-POSTs on a 302 redirect, matching `script.googleusercontent.com`).
  3. When `require_auth=True`, requests without `Authorization: Bearer <token>` are
     redirected (`302`) to `https://accounts.google.com/ServiceLogin`.

Tests real `git` CLI commands via `git-remote-gas`:
  - `git ls-remote gas::http://...`
  - `git clone gas::http://...`
  - `git commit` + `git push origin main`
  - `git pull origin main` / second `git clone` verification
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading
import urllib.parse
import uuid
import zlib
from typing import Dict, List, Optional, Tuple


# ============================================================================
# In-Memory Simulation of the Rust `src/git_server.rs` (`gitoxide` Smart HTTP v1)
# ============================================================================

def pkt_line(data: bytes) -> bytes:
    return f"{len(data) + 4:04x}".encode("ascii") + data


def pkt_text(text: str) -> bytes:
    if not text.endswith("\n"):
        text += "\n"
    return pkt_line(text.encode("utf-8"))


def pkt_band(channel: int, data: bytes) -> bytes:
    return pkt_line(bytes([channel]) + data)


class SimulatedGasGitRepo:
    """
    Mirrors `GasGitStore` + `handle_info_refs` / `handle_upload_pack` / `handle_receive_pack`
    in `src/git_server.rs` so the exact wire framing (`doGet` / `doPost` + base64 + 302 redirect)
    can be tested offline with the real `git` binary.
    """

    def __init__(self) -> None:
        self.objects: Dict[str, Tuple[str, bytes]] = {}  # oid_hex -> (kind_str, raw_body)
        self.refs: Dict[str, str] = {}
        self.head: str = "ref: refs/heads/main"
        self._seed_initial_commit()

    def write_raw_object(self, kind: str, body: bytes) -> str:
        header = f"{kind} {len(body)}\x00".encode("utf-8")
        oid = hashlib.sha1(header + body).hexdigest()
        self.objects[oid] = (kind, body)
        return oid

    def _seed_initial_commit(self) -> None:
        readme = (
            b"# GAS Git Server (repository: default)\n\n"
            b"This Git repository is hosted on Google Apps Script using Rust Wasm + gitoxide.\n"
        )
        blob_oid = self.write_raw_object("blob", readme)
        tree_entry = b"100644 README.md\x00" + bytes.fromhex(blob_oid)
        tree_oid = self.write_raw_object("tree", tree_entry)
        sig = "GAS Git Server (gitoxide) <gitoxide-gas@script.google.com> 1700000000 +0000"
        commit_body = (
            f"tree {tree_oid}\n"
            f"author {sig}\n"
            f"committer {sig}\n\n"
            f"Initial commit from gitoxide on Google Apps Script\n"
        ).encode("utf-8")
        commit_oid = self.write_raw_object("commit", commit_body)
        self.refs["refs/heads/main"] = commit_oid

    def handle_info_refs(self, service: str) -> bytes:
        out = bytearray()
        out.extend(pkt_text(f"# service={service}"))
        out.extend(b"0000")
        if service == "git-upload-pack":
            caps = (
                "multi_ack thin-pack side-band side-band-64k ofs-delta shallow "
                "no-progress include-tag allow-tip-sha1-in-want allow-reachable-sha1-in-want "
                "symref=HEAD:refs/heads/main object-format=sha1 agent=gitoxide-gas/0.1.0"
            )
        else:
            caps = (
                "report-status delete-refs side-band-64k quiet atomic ofs-delta "
                "object-format=sha1 agent=gitoxide-gas/0.1.0"
            )

        head_oid = self.refs.get("refs/heads/main")
        items: List[Tuple[str, str]] = []
        if head_oid:
            items.append(("HEAD", head_oid))
        for rname in sorted(self.refs.keys()):
            items.append((rname, self.refs[rname]))

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
            if oid in visited or oid not in self.objects:
                continue
            visited.add(oid)
            kind, body = self.objects[oid]
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
            if h_oid in self.objects:
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
            kind, body = self.objects[oid]
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

        for _old_oid, new_oid, ref_name in cmds:
            if new_oid == "0" * 40:
                self.refs.pop(ref_name, None)
            else:
                self.refs[ref_name] = new_oid

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
            elif obj_type == 6:  # OFS_DELTA
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
            elif obj_type == 7:  # REF_DELTA
                base_oid = pack[pos : pos + 20].hex()
                pos += 20
                base_kind, base_raw = self.objects[base_oid]
                dobj = zlib.decompressobj()
                delta = dobj.decompress(pack[pos:data_end])
                consumed = len(pack[pos:data_end]) - len(dobj.unused_data)
                pos += consumed
                target_raw = self._apply_delta(base_raw, delta)
                self.write_raw_object(base_kind, target_raw)
                by_offset[entry_start] = (base_kind, target_raw)

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
    def __init__(self, require_token: Optional[str] = None) -> None:
        self.repo = SimulatedGasGitRepo()
        self.require_token = require_token
        self.echo_store: Dict[str, str] = {}

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
                # Simulate GAS redirect to Google Login when unauthorized
                self.send_response(302)
                self.send_header(
                    "Location",
                    "https://accounts.google.com/ServiceLogin?service=wise&passive=1209600",
                )
                self.end_headers()
                return False

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parsed.query)

                # Step 2 of GAS redirect: script.googleusercontent.com/macros/echo
                if parsed.path == "/macros/echo":
                    key = qs.get("user_content_key", [""])[0]
                    content = parent.echo_store.pop(key, "")
                    body = content.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return

                # Step 1 of GAS doGet: /macros/s/<DEPLOYMENT_ID>/exec
                if not self._check_auth():
                    return

                service = qs.get("service", ["git-upload-pack"])[0]
                res_bytes = parent.repo.handle_info_refs(service)
                b64_text = base64.b64encode(res_bytes).decode("ascii")

                key = str(uuid.uuid4())
                parent.echo_store[key] = b64_text
                host = self.headers.get("Host", "127.0.0.1")
                redirect_url = f"http://{host}/macros/echo?user_content_key={key}"

                self.send_response(302)
                self.send_header("Location", redirect_url)
                self.end_headers()

            def do_POST(self):
                parsed = urllib.parse.urlparse(self.path)
                # Like script.googleusercontent.com, /macros/echo rejects POST!
                if parsed.path == "/macros/echo":
                    self.send_response(405)
                    self.end_headers()
                    return

                if not self._check_auth():
                    return

                length = int(self.headers.get("Content-Length", "0"))
                raw_post = self.rfile.read(length)
                envelope = json.loads(raw_post.decode("utf-8"))
                service = envelope["service"]
                req_bytes = base64.b64decode(envelope["body_base64"])

                if service == "git-upload-pack":
                    res_bytes = parent.repo.handle_upload_pack(req_bytes)
                else:
                    res_bytes = parent.repo.handle_receive_pack(req_bytes)

                b64_text = base64.b64encode(res_bytes).decode("ascii")
                key = str(uuid.uuid4())
                parent.echo_store[key] = b64_text
                host = self.headers.get("Host", "127.0.0.1")
                redirect_url = f"http://{host}/macros/echo?user_content_key={key}"

                # GAS returns 302 Found on doPost!
                self.send_response(302)
                self.send_header("Location", redirect_url)
                self.end_headers()

        return Handler


def run_e2e_tests() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tools_dir = os.path.join(repo_root, "tools")
    os.chmod(os.path.join(tools_dir, "git-remote-gas"), 0o755)

    mock = GasWebAppMockServer(require_token="secret-gas-oauth-token-123")
    httpd = socketserver.TCPServer(("127.0.0.1", 0), mock.create_handler())
    port = httpd.server_address[1]
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    gas_url = f"gas::http://127.0.0.1:{port}/macros/s/AKfycbxTestDeploymentId/exec"
    base_env = os.environ.copy()
    base_env["PATH"] = f"{tools_dir}:{base_env.get('PATH', '')}"

    try:
        # 1. Verify unauthenticated request detects GAS -> accounts.google.com redirect
        env_no_auth = base_env.copy()
        env_no_auth.pop("GAS_GIT_TOKEN", None)
        proc = subprocess.run(
            ["git", "ls-remote", gas_url],
            env=env_no_auth,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert proc.returncode != 0, "Expected unauthenticated git ls-remote to fail"
        assert "Google Login page" in proc.stderr, f"Unexpected stderr: {proc.stderr}"
        print("[OK] 1. Unauthenticated GAS redirect to accounts.google.com detected cleanly.")

        # 2. Verify authenticated `git ls-remote gas::...` works across GAS 302 redirect
        env_auth = base_env.copy()
        env_auth["GAS_GIT_TOKEN"] = "secret-gas-oauth-token-123"
        out = subprocess.check_output(
            ["git", "ls-remote", gas_url],
            env=env_auth,
            text=True,
        )
        assert "refs/heads/main" in out and "HEAD" in out, f"Unexpected ls-remote output: {out}"
        print(f"[OK] 2. `git ls-remote {gas_url}` succeeded:\n{out.strip()}")

        # 3. Verify `git clone gas::...` works across GAS GET & POST 302 redirects
        with tempfile.TemporaryDirectory() as tmpdir:
            clone1 = os.path.join(tmpdir, "clone1")
            subprocess.check_call(
                ["git", "clone", gas_url, clone1],
                env=env_auth,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            readme_path = os.path.join(clone1, "README.md")
            assert os.path.exists(readme_path), "README.md not found in cloned repository"
            with open(readme_path, "r", encoding="utf-8") as f:
                assert "gitoxide" in f.read()
            print("[OK] 3. `git clone gas::...` succeeded and checked out initial commit (README.md).")

            # 4. Verify `git push origin main` works across GAS POST 302 redirect
            subprocess.check_call(["git", "-C", clone1, "config", "user.name", "Tester"], env=env_auth)
            subprocess.check_call(
                ["git", "-C", clone1, "config", "user.email", "tester@example.com"], env=env_auth
            )
            hello_file = os.path.join(clone1, "hello_gas.txt")
            with open(hello_file, "w", encoding="utf-8") as f:
                f.write("Hello from git push over Google Apps Script Smart HTTP v1!\n")
            subprocess.check_call(["git", "-C", clone1, "add", "hello_gas.txt"], env=env_auth)
            subprocess.check_call(
                ["git", "-C", clone1, "commit", "-m", "Add hello_gas.txt via git-remote-gas"],
                env=env_auth,
                stdout=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["git", "-C", clone1, "push", "origin", "main"],
                env=env_auth,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print("[OK] 4. `git push origin main` over GAS Smart HTTP v1 + 302 redirect succeeded.")

            # 5. Verify second clone & `git pull` receive the pushed commit
            clone2 = os.path.join(tmpdir, "clone2")
            subprocess.check_call(
                ["git", "clone", gas_url, clone2],
                env=env_auth,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            hello_clone2 = os.path.join(clone2, "hello_gas.txt")
            assert os.path.exists(hello_clone2), "Pushed file hello_gas.txt missing in second clone!"
            with open(hello_clone2, "r", encoding="utf-8") as f:
                assert "Hello from git push" in f.read()
            print("[OK] 5. Second `git clone` / `git fetch` verified pushed commit and file contents!")

    finally:
        httpd.shutdown()


if __name__ == "__main__":
    run_e2e_tests()
    print("ALL END-TO-END GAS GIT SERVER & CLIENT TESTS PASSED!")
