//! `git-upload-pack` for Smart HTTP v1 (stateless RPC), independent of the GAS host bindings.
//!
//! Every HTTP request is one complete, self-contained "round" of the v0/v1 protocol, exactly as
//! `git upload-pack --stateless-rpc` handles it:
//!
//! ```text
//! request  := want-section flush [have-lines] (flush | "done")
//! response := [shallow-section flush] [ack-lines [pack]]    (shallow section only with `deepen`,
//!             no ack-lines if the request ends after the want section, pack only after "done")
//! ```
//!
//! Implemented capabilities (all of them are advertised by `handle_info_refs`):
//! - `multi_ack` / `multi_ack_detailed`: `ACK <oid> continue|common|ready` while negotiating, final
//!   `ACK <last-common>` after `done` (real `git fetch-pack` requires `multi_ack_detailed` over HTTP).
//! - `shallow`: `shallow` / `deepen <n>` requests, `shallow` / `unshallow` replies, depth-limited packs.
//! - `ofs-delta` / `thin-pack`: blobs and trees are delta-compressed against the previous version at the same
//!   path, either inside the pack (`OFS_DELTA`) or, with `thin-pack`, against objects the client already
//!   has (`REF_DELTA`; the client completes the pack with `index-pack --fix-thin`).
//! - `include-tag`: annotated tags whose target is sent are added to the pack.
//! - `side-band` / `side-band-64k` / `no-progress`.
//!
//! The module only needs [`GitObjectReader`], so it is unit-tested natively against real `git` clients.

use std::collections::{BTreeMap, VecDeque};
use std::hash::{BuildHasherDefault, Hasher};
use std::io::Write as _;

use gix_hash::{Kind as HashKind, ObjectId};
use gix_object::{Kind as ObjectKind, ObjectRef};
use gix_packetline::{Channel, blocking_io::encode as pkt_encode};
use gix_zlib::{Compression, stream::deflate};

use crate::git_server::GitObjectReader;

/// Hash maps/sets with a fixed, seed-free hasher. std's default `RandomState` asks the host for a
/// random seed (`wasi:random/insecure-seed`) on first use; keys here are object ids and paths that
/// the client cannot use to degrade the maps meaningfully, so a deterministic hasher is fine.
type HashMap<K, V> = std::collections::HashMap<K, V, BuildHasherDefault<FxHasher>>;
type HashSet<T> = std::collections::HashSet<T, BuildHasherDefault<FxHasher>>;

/// FxHash-style multiplicative hasher (deterministic).
#[derive(Default, Clone, Copy)]
struct FxHasher(u64);

impl Hasher for FxHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        let mut chunks = bytes.chunks_exact(8);
        for c in &mut chunks {
            self.add(u64::from_le_bytes(c.try_into().unwrap()));
        }
        let rest = chunks.remainder();
        if !rest.is_empty() {
            let mut buf = [0u8; 8];
            buf[..rest.len()].copy_from_slice(rest);
            self.add(u64::from_le_bytes(buf) ^ rest.len() as u64);
        }
    }
    fn write_u8(&mut self, v: u8) {
        self.add(v as u64);
    }
    fn write_usize(&mut self, v: usize) {
        self.add(v as u64);
    }
}

impl FxHasher {
    #[inline]
    fn add(&mut self, v: u64) {
        self.0 = (self.0.rotate_left(5) ^ v).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
}

/// `deepen` value git sends for `--unshallow` (`INFINITE_DEPTH` in git's `shallow.h`).
pub const INFINITE_DEPTH: u32 = 0x7fff_ffff;
/// Maximum side-band payload per pkt-line for `side-band-64k` (65520 - 4 length - 1 band byte).
const MAX_SIDEBAND_64K: usize = 65515;
/// Maximum side-band payload per pkt-line for the legacy `side-band` (1000 - 4 - 1).
const MAX_SIDEBAND_1K: usize = 995;
/// Longest delta chain produced (git's default `pack.depth` is 50; shorter keeps client inflate cheap).
const MAX_DELTA_DEPTH: u32 = 16;
/// Objects outside this size range are never delta-compressed (too small to gain / too costly on GAS CPU).
const MIN_DELTA_SIZE: usize = 64;
const MAX_DELTA_SIZE: usize = 4 * 1024 * 1024;
/// Upper bound on edge commits whose trees are walked to find what the client already has.
const MAX_EDGE_TREES: usize = 16;

// ---------------------------------------------------------------------------------------------
// pkt-line request parsing
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Pkt<'a> {
    Data(&'a [u8]),
    Flush,
}

/// Split a request body into pkt-lines. Trailing garbage shorter than a header is ignored.
fn split_pkt_lines(mut data: &[u8]) -> Result<Vec<Pkt<'_>>, String> {
    let mut out = Vec::new();
    while data.len() >= 4 {
        let hex = std::str::from_utf8(&data[..4]).map_err(|_| "invalid pkt-line length".to_string())?;
        let len = usize::from_str_radix(hex, 16).map_err(|_| format!("invalid pkt-line length '{}'", hex))?;
        match len {
            0 => {
                out.push(Pkt::Flush);
                data = &data[4..];
            }
            1 | 2 => {
                // delim-pkt / response-end-pkt (protocol v2 only); treat as a section break.
                out.push(Pkt::Flush);
                data = &data[4..];
            }
            3 => return Err("invalid pkt-line length 3".to_string()),
            _ => {
                if len > data.len() {
                    return Err(format!("truncated pkt-line ({} > {} bytes)", len, data.len()));
                }
                let mut payload = &data[4..len];
                if let Some(stripped) = payload.strip_suffix(b"\n") {
                    payload = stripped;
                }
                out.push(Pkt::Data(payload));
                data = &data[len..];
            }
        }
    }
    Ok(out)
}

fn parse_oid(hex: &str, what: &str) -> Result<ObjectId, String> {
    ObjectId::from_hex(hex.as_bytes()).map_err(|e| format!("invalid {} object id '{}': {}", what, hex, e))
}

/// One parsed stateless upload-pack request.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct UploadRequest {
    pub wants: Vec<ObjectId>,
    pub caps: Vec<String>,
    pub client_shallows: Vec<ObjectId>,
    pub deepen: Option<u32>,
    pub haves: Vec<ObjectId>,
    /// `true` if the request ends with `done` (the response must carry a pack).
    pub done: bool,
    /// `false` if the request ends right after the want section. git's stateless clients send such a
    /// request to read the shallow list only (`--depth` first round); it gets no ACK/NAK.
    pub negotiation: bool,
}

impl UploadRequest {
    fn has_cap(&self, cap: &str) -> bool {
        self.caps.iter().any(|c| c == cap)
    }

    pub fn parse(body: &[u8]) -> Result<Self, String> {
        let pkts = split_pkt_lines(body)?;
        let mut req = UploadRequest::default();
        let mut iter = pkts.into_iter();

        // Section 1: want / shallow / deepen lines up to the first flush.
        for pkt in iter.by_ref() {
            let Pkt::Data(line) = pkt else { break };
            let line = std::str::from_utf8(line).map_err(|_| "upload-pack request is not UTF-8".to_string())?;
            // Capabilities follow the first `want` (separated by a space, or a NUL in some clients).
            let line = line.replace('\0', " ");
            let mut tokens = line.split_whitespace();
            match tokens.next() {
                Some("want") => {
                    let oid = parse_oid(tokens.next().unwrap_or(""), "want")?;
                    if !req.wants.contains(&oid) {
                        req.wants.push(oid);
                    }
                    req.caps.extend(tokens.map(str::to_string));
                }
                Some("shallow") => {
                    let oid = parse_oid(tokens.next().unwrap_or(""), "shallow")?;
                    if !req.client_shallows.contains(&oid) {
                        req.client_shallows.push(oid);
                    }
                }
                Some("deepen") => {
                    let raw = tokens.next().unwrap_or("");
                    let n = raw
                        .parse::<u32>()
                        .map_err(|_| format!("invalid deepen value '{}'", raw))?;
                    if n == 0 {
                        return Err("deepen 0 is not valid".to_string());
                    }
                    req.deepen = Some(n.min(INFINITE_DEPTH));
                }
                Some(other @ ("deepen-since" | "deepen-not" | "filter")) => {
                    return Err(format!("'{}' is not supported by this server", other));
                }
                Some(other) => return Err(format!("unexpected line in want section: '{}'", other)),
                None => {}
            }
        }

        // Section 2: have lines up to a flush (negotiation round) or `done`.
        for pkt in iter {
            req.negotiation = true;
            match pkt {
                Pkt::Flush => break,
                Pkt::Data(line) => {
                    let line = String::from_utf8_lossy(line);
                    if line == "done" {
                        req.done = true;
                        break;
                    }
                    let Some(hex) = line.strip_prefix("have ") else {
                        return Err(format!("expected have/done, got '{}'", line));
                    };
                    req.haves.push(parse_oid(hex.trim(), "have")?);
                }
            }
        }
        Ok(req)
    }
}

// ---------------------------------------------------------------------------------------------
// Object access helpers
// ---------------------------------------------------------------------------------------------

/// Decoded object body plus its kind.
fn read_object(reader: &mut dyn GitObjectReader, oid: &ObjectId) -> Option<(ObjectKind, Vec<u8>)> {
    let loose = reader.read_loose(oid)?;
    let (kind, size, offset) = gix_object::decode::loose_header(&loose).ok()?;
    let end = offset.checked_add(size as usize)?;
    if end > loose.len() {
        return None;
    }
    let mut body = loose;
    body.truncate(end);
    body.drain(..offset);
    Some((kind, body))
}

/// Commit graph view used for negotiation, shallow computation and pack selection.
/// Parents come from the cheap commit index (`list_commits`) when available and fall back to
/// reading the commit object.
struct Graph {
    parents: HashMap<ObjectId, Vec<ObjectId>>,
    trees: HashMap<ObjectId, ObjectId>,
    index_loaded: bool,
}

impl Graph {
    fn new() -> Self {
        Self {
            parents: HashMap::default(),
            trees: HashMap::default(),
            index_loaded: false,
        }
    }

    fn load_index(&mut self, reader: &mut dyn GitObjectReader) {
        if self.index_loaded {
            return;
        }
        self.index_loaded = true;
        for c in reader.list_commits() {
            let Ok(oid) = ObjectId::from_hex(c.oid.as_bytes()) else { continue };
            let parents = c
                .parents
                .iter()
                .filter_map(|p| ObjectId::from_hex(p.as_bytes()).ok())
                .collect();
            self.parents.entry(oid).or_insert(parents);
        }
    }

    /// Read a commit object, caching its tree and parents. `None` if `oid` is not a commit.
    fn read_commit(&mut self, reader: &mut dyn GitObjectReader, oid: &ObjectId) -> Option<(ObjectId, Vec<ObjectId>)> {
        if let (Some(tree), Some(parents)) = (self.trees.get(oid), self.parents.get(oid)) {
            return Some((*tree, parents.clone()));
        }
        let (kind, body) = read_object(reader, oid)?;
        if kind != ObjectKind::Commit {
            return None;
        }
        let ObjectRef::Commit(c) = ObjectRef::from_bytes(kind, &body).ok()? else {
            return None;
        };
        let tree = c.tree();
        let parents: Vec<ObjectId> = c.parents().collect();
        self.trees.insert(*oid, tree);
        self.parents.insert(*oid, parents.clone());
        Some((tree, parents))
    }

    fn parents_of(&mut self, reader: &mut dyn GitObjectReader, oid: &ObjectId) -> Vec<ObjectId> {
        if let Some(p) = self.parents.get(oid) {
            return p.clone();
        }
        self.read_commit(reader, oid).map(|(_, p)| p).unwrap_or_default()
    }

    /// Does the server have commit `oid` (a `have` line)?
    /// Answered from the commit index when it is available: on GAS a miss in `read_loose` would load
    /// every Drive bundle, and clients routinely send haves for local commits the server never saw.
    /// An incomplete index only makes the pack larger, never wrong.
    fn has(&mut self, reader: &mut dyn GitObjectReader, oid: &ObjectId) -> bool {
        if self.parents.contains_key(oid) {
            return true;
        }
        if self.index_loaded && !self.parents.is_empty() {
            return false;
        }
        reader.read_loose(oid).is_some()
    }
}

/// Follow a tag chain to its final (non-tag) target, returning every tag object on the way.
fn peel_tag(reader: &mut dyn GitObjectReader, oid: &ObjectId) -> Option<(Vec<ObjectId>, ObjectId, ObjectKind)> {
    let mut chain = Vec::new();
    let mut current = *oid;
    for _ in 0..16 {
        let (kind, body) = read_object(reader, &current)?;
        if kind != ObjectKind::Tag {
            return Some((chain, current, kind));
        }
        let ObjectRef::Tag(tag) = ObjectRef::from_bytes(kind, &body).ok()? else {
            return None;
        };
        chain.push(current);
        current = tag.target();
    }
    None
}

/// Return the peeled target of `oid` if it is an annotated tag (for `^{}` lines in the ref advertisement).
pub fn peeled_target(reader: &mut dyn GitObjectReader, oid: &ObjectId) -> Option<ObjectId> {
    let (chain, target, _) = peel_tag(reader, oid)?;
    (!chain.is_empty()).then_some(target)
}

// ---------------------------------------------------------------------------------------------
// Shallow handling (mirrors git's `deepen()` / `get_shallow_commits()` in upload-pack.c)
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Default)]
struct ShallowInfo {
    /// Commits that become shallow for the client (pack boundary).
    new_shallows: HashSet<ObjectId>,
    /// Client shallow commits whose history is now sent.
    unshallowed: HashSet<ObjectId>,
    /// Lines for the shallow-update section (`shallow X` first, then `unshallow X`).
    lines: Vec<String>,
}

fn compute_shallow(
    reader: &mut dyn GitObjectReader,
    graph: &mut Graph,
    want_commits: &[ObjectId],
    client_shallows: &HashSet<ObjectId>,
    depth: u32,
) -> ShallowInfo {
    let mut info = ShallowInfo::default();
    if depth >= INFINITE_DEPTH {
        // `--unshallow`: every client shallow commit gets its full history.
        info.unshallowed = client_shallows.clone();
    } else {
        // Breadth-first from the wants: depth 1 = the wanted commits themselves.
        let mut seen: HashSet<ObjectId> = HashSet::default();
        let mut queue: VecDeque<(ObjectId, u32)> = want_commits.iter().map(|c| (*c, 1)).collect();
        let mut not_shallow: HashSet<ObjectId> = HashSet::default();
        let mut shallow_order: Vec<ObjectId> = Vec::new();
        while let Some((c, d)) = queue.pop_front() {
            if !seen.insert(c) {
                continue;
            }
            if d >= depth {
                shallow_order.push(c);
                continue;
            }
            not_shallow.insert(c);
            for p in graph.parents_of(reader, &c) {
                if !seen.contains(&p) {
                    queue.push_back((p, d + 1));
                }
            }
        }
        for c in shallow_order {
            if not_shallow.contains(&c) {
                continue;
            }
            info.new_shallows.insert(c);
            if !client_shallows.contains(&c) {
                info.lines.push(format!("shallow {}", c.to_hex()));
            }
        }
        info.unshallowed = client_shallows
            .iter()
            .filter(|c| not_shallow.contains(*c))
            .copied()
            .collect();
    }
    let mut unshallowed: Vec<&ObjectId> = info.unshallowed.iter().collect();
    unshallowed.sort();
    for c in unshallowed {
        info.lines.push(format!("unshallow {}", c.to_hex()));
    }
    info
}

// ---------------------------------------------------------------------------------------------
// Negotiation helper: git's ok_to_give_up()
// ---------------------------------------------------------------------------------------------

/// Cached answer to "does every wanted commit have a common commit in its ancestry?".
/// When true the server may tell a `multi_ack` client to stop sending haves (`ACK … ready/continue`).
#[derive(Default)]
struct GiveUp {
    cached: Option<bool>,
}

impl GiveUp {
    fn invalidate(&mut self) {
        if self.cached == Some(false) {
            self.cached = None;
        }
    }

    fn ok(
        &mut self,
        reader: &mut dyn GitObjectReader,
        graph: &mut Graph,
        want_commits: &[ObjectId],
        commons: &[ObjectId],
        grafts: &HashSet<ObjectId>,
    ) -> bool {
        if commons.is_empty() || want_commits.is_empty() {
            return false;
        }
        if let Some(v) = self.cached {
            return v;
        }
        let common_set: HashSet<ObjectId> = commons.iter().copied().collect();
        let result = want_commits.iter().all(|want| {
            let mut seen: HashSet<ObjectId> = HashSet::default();
            let mut queue: VecDeque<ObjectId> = VecDeque::from([*want]);
            while let Some(c) = queue.pop_front() {
                if common_set.contains(&c) {
                    return true;
                }
                // The client's shallow commits have no parents on the client side (git registers them
                // as shallow grafts), so the walk must not look past them.
                if seen.insert(c) && !grafts.contains(&c) {
                    queue.extend(graph.parents_of(reader, &c));
                }
            }
            false
        });
        self.cached = Some(result);
        result
    }
}

// ---------------------------------------------------------------------------------------------
// Delta compression
// ---------------------------------------------------------------------------------------------

/// Cheap hasher for the 16-byte window keys of the delta index.
#[derive(Default)]
struct WindowHasher(u64);

impl Hasher for WindowHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for chunk in bytes.chunks(8) {
            let mut buf = [0u8; 8];
            buf[..chunk.len()].copy_from_slice(chunk);
            self.0 = (self.0 ^ u64::from_le_bytes(buf)).wrapping_mul(0x9E37_79B9_7F4A_7C15).rotate_left(29);
        }
    }
    fn write_u128(&mut self, v: u128) {
        let x = (v as u64) ^ ((v >> 64) as u64).rotate_left(32);
        self.0 = x.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ (x >> 29);
    }
}

fn push_delta_varint(out: &mut Vec<u8>, mut v: usize) {
    loop {
        let b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(b);
            return;
        }
        out.push(b | 0x80);
    }
}

fn push_delta_literal(out: &mut Vec<u8>, data: &[u8]) {
    for chunk in data.chunks(127) {
        out.push(chunk.len() as u8);
        out.extend_from_slice(chunk);
    }
}

fn push_delta_copy(out: &mut Vec<u8>, mut offset: usize, mut len: usize) {
    while len > 0 {
        let n = len.min(0xFFFF);
        let cmd_pos = out.len();
        out.push(0);
        let mut cmd = 0x80u8;
        for i in 0..4 {
            let byte = ((offset >> (8 * i)) & 0xff) as u8;
            if byte != 0 {
                cmd |= 1 << i;
                out.push(byte);
            }
        }
        for i in 0..2 {
            let byte = ((n >> (8 * i)) & 0xff) as u8;
            if byte != 0 {
                cmd |= 0x10 << i;
                out.push(byte);
            }
        }
        out[cmd_pos] = cmd;
        offset += n;
        len -= n;
    }
}

/// Create a git delta that rebuilds `target` from `base` (format understood by `git index-pack` and
/// [`crate::git_server`]'s `apply_git_delta`). Returns `None` if the delta would exceed `max_len` bytes.
pub fn create_delta(base: &[u8], target: &[u8], max_len: usize) -> Option<Vec<u8>> {
    const BLOCK: usize = 16;
    if base.len() < BLOCK || target.len() < BLOCK || base.len() > u32::MAX as usize {
        return None;
    }
    let window = |data: &[u8], at: usize| -> u128 {
        let mut b = [0u8; BLOCK];
        b.copy_from_slice(&data[at..at + BLOCK]);
        u128::from_le_bytes(b)
    };

    // Index non-overlapping 16-byte blocks of the base (first occurrence wins).
    let mut index: std::collections::HashMap<u128, u32, BuildHasherDefault<WindowHasher>> =
        std::collections::HashMap::with_capacity_and_hasher(base.len() / BLOCK + 1, Default::default());
    let mut i = 0;
    while i + BLOCK <= base.len() {
        index.entry(window(base, i)).or_insert(i as u32);
        i += BLOCK;
    }

    let mut out = Vec::with_capacity(target.len() / 8 + 16);
    push_delta_varint(&mut out, base.len());
    push_delta_varint(&mut out, target.len());

    let mut pos = 0usize;
    let mut literal_start = 0usize;
    while pos + BLOCK <= target.len() {
        let Some(&base_off) = index.get(&window(target, pos)) else {
            pos += 1;
            continue;
        };
        // Extend the match backwards into the pending literal, then forwards.
        let mut t = pos;
        let mut b = base_off as usize;
        while t > literal_start && b > 0 && target[t - 1] == base[b - 1] {
            t -= 1;
            b -= 1;
        }
        let mut len = (pos - t) + BLOCK;
        while t + len < target.len() && b + len < base.len() && target[t + len] == base[b + len] {
            len += 1;
        }
        push_delta_literal(&mut out, &target[literal_start..t]);
        push_delta_copy(&mut out, b, len);
        pos = t + len;
        literal_start = pos;
        if out.len() > max_len {
            return None;
        }
    }
    push_delta_literal(&mut out, &target[literal_start..]);
    (out.len() <= max_len).then_some(out)
}

// ---------------------------------------------------------------------------------------------
// Pack writer
// ---------------------------------------------------------------------------------------------

fn pack_type_id(kind: ObjectKind) -> u8 {
    match kind {
        ObjectKind::Commit => 1,
        ObjectKind::Tree => 2,
        ObjectKind::Blob => 3,
        ObjectKind::Tag => 4,
    }
}

/// Encode a pack entry header (type + uncompressed size varint).
pub fn encode_pack_obj_header(type_id: u8, mut size: usize, out: &mut Vec<u8>) {
    let mut byte = ((type_id & 0x07) << 4) | ((size & 0x0f) as u8);
    size >>= 4;
    while size > 0 {
        out.push(byte | 0x80);
        byte = (size & 0x7f) as u8;
        size >>= 7;
    }
    out.push(byte);
}

fn deflate_into(data: &[u8], out: &mut Vec<u8>) -> Result<(), String> {
    let mut deflater = deflate::Write::new(Vec::new(), Compression::DEFAULT);
    deflater
        .write_all(data)
        .and_then(|_| deflater.flush())
        .map_err(|e| format!("zlib deflate error: {}", e))?;
    out.extend_from_slice(&deflater.into_inner());
    Ok(())
}

/// Builds a PACK v2 stream in memory.
pub struct PackWriter {
    buf: Vec<u8>,
    count: u32,
}

impl Default for PackWriter {
    fn default() -> Self {
        Self::new()
    }
}

impl PackWriter {
    pub fn new() -> Self {
        let mut buf = Vec::with_capacity(4096);
        buf.extend_from_slice(b"PACK");
        buf.extend_from_slice(&2u32.to_be_bytes());
        buf.extend_from_slice(&0u32.to_be_bytes());
        Self { buf, count: 0 }
    }

    pub fn count(&self) -> u32 {
        self.count
    }

    /// Append a full (non-delta) object; returns its entry offset.
    pub fn write_full(&mut self, kind: ObjectKind, body: &[u8]) -> Result<usize, String> {
        let offset = self.buf.len();
        encode_pack_obj_header(pack_type_id(kind), body.len(), &mut self.buf);
        deflate_into(body, &mut self.buf)?;
        self.count += 1;
        Ok(offset)
    }

    /// Append an `OFS_DELTA` entry whose base starts at `base_offset` in this pack.
    fn write_ofs_delta(&mut self, base_offset: usize, delta: &[u8]) -> Result<usize, String> {
        let offset = self.buf.len();
        encode_pack_obj_header(6, delta.len(), &mut self.buf);
        // Negative offset, big-endian base-128 with the "+1 per continuation" encoding git uses.
        let mut rel = offset - base_offset;
        let mut tmp = [0u8; 16];
        let mut pos = tmp.len() - 1;
        tmp[pos] = (rel & 0x7f) as u8;
        rel >>= 7;
        while rel > 0 {
            rel -= 1;
            pos -= 1;
            tmp[pos] = 0x80 | (rel & 0x7f) as u8;
            rel >>= 7;
        }
        self.buf.extend_from_slice(&tmp[pos..]);
        deflate_into(delta, &mut self.buf)?;
        self.count += 1;
        Ok(offset)
    }

    /// Append a `REF_DELTA` entry against `base` (inside the pack, or held by the client for thin packs).
    fn write_ref_delta(&mut self, base: &ObjectId, delta: &[u8]) -> Result<usize, String> {
        let offset = self.buf.len();
        encode_pack_obj_header(7, delta.len(), &mut self.buf);
        self.buf.extend_from_slice(base.as_bytes());
        deflate_into(delta, &mut self.buf)?;
        self.count += 1;
        Ok(offset)
    }

    /// Patch the object count, append the SHA-1 trailer and return the finished pack.
    pub fn finish(mut self) -> Result<Vec<u8>, String> {
        self.buf[8..12].copy_from_slice(&self.count.to_be_bytes());
        let mut hasher = gix_hash::hasher(HashKind::Sha1);
        hasher.update(&self.buf);
        let checksum = hasher
            .try_finalize()
            .map_err(|e| format!("pack SHA-1 finalize error: {}", e))?;
        self.buf.extend_from_slice(checksum.as_bytes());
        Ok(self.buf)
    }
}

// ---------------------------------------------------------------------------------------------
// Pack content selection and emission
// ---------------------------------------------------------------------------------------------

struct PackBuilder<'r> {
    reader: &'r mut dyn GitObjectReader,
    writer: PackWriter,
    use_ofs: bool,
    use_thin: bool,
    /// Objects the client is known to have (trees/blobs of edge commits).
    client_has: HashSet<ObjectId>,
    /// path -> object the client has at that path (thin-pack bases).
    client_paths: HashMap<String, ObjectId>,
    /// Objects already in this pack: oid -> (entry offset, delta chain depth).
    emitted: HashMap<ObjectId, (usize, u32)>,
    /// path -> most recently emitted object at that path (in-pack delta bases).
    last_at_path: HashMap<String, ObjectId>,
}

impl PackBuilder<'_> {
    fn skip(&self, oid: &ObjectId) -> bool {
        self.emitted.contains_key(oid) || self.client_has.contains(oid)
    }

    /// Emit `oid` (if needed), delta-compressing trees/blobs against the last version at `path`.
    fn emit(&mut self, oid: &ObjectId, kind: ObjectKind, body: &[u8], path: Option<&str>) -> Result<(), String> {
        if self.emitted.contains_key(oid) {
            return Ok(());
        }
        let deltifiable =
            matches!(kind, ObjectKind::Blob | ObjectKind::Tree) && (MIN_DELTA_SIZE..=MAX_DELTA_SIZE).contains(&body.len());
        let mut written: Option<(usize, u32)> = None;
        if let (true, Some(path)) = (deltifiable, path) {
            written = self.try_emit_delta(oid, kind, body, path)?;
        }
        let entry = match written {
            Some(entry) => entry,
            None => (self.writer.write_full(kind, body)?, 0),
        };
        self.emitted.insert(*oid, entry);
        if let Some(path) = path {
            self.last_at_path.insert(path.to_string(), *oid);
        }
        Ok(())
    }

    fn try_emit_delta(
        &mut self,
        oid: &ObjectId,
        kind: ObjectKind,
        body: &[u8],
        path: &str,
    ) -> Result<Option<(usize, u32)>, String> {
        let max_len = body.len() / 2;
        // 1. Previous version at the same path inside this pack (reverse delta, newest stored whole).
        if let Some(base_oid) = self.last_at_path.get(path).copied() {
            if let Some(&(base_offset, base_depth)) = self.emitted.get(&base_oid) {
                if base_depth < MAX_DELTA_DEPTH {
                    if let Some((base_kind, base_body)) = read_object(self.reader, &base_oid) {
                        if base_kind == kind {
                            if let Some(delta) = create_delta(&base_body, body, max_len) {
                                let offset = if self.use_ofs {
                                    self.writer.write_ofs_delta(base_offset, &delta)?
                                } else {
                                    self.writer.write_ref_delta(&base_oid, &delta)?
                                };
                                return Ok(Some((offset, base_depth + 1)));
                            }
                        }
                    }
                }
            }
        }
        // 2. thin-pack: the version the client already has at this path.
        if self.use_thin {
            if let Some(base_oid) = self.client_paths.get(path).copied() {
                if base_oid != *oid {
                    if let Some((base_kind, base_body)) = read_object(self.reader, &base_oid) {
                        if base_kind == kind {
                            if let Some(delta) = create_delta(&base_body, body, max_len) {
                                let offset = self.writer.write_ref_delta(&base_oid, &delta)?;
                                return Ok(Some((offset, 1)));
                            }
                        }
                    }
                }
            }
        }
        Ok(None)
    }

    /// Emit a tree and everything below it that the client does not have.
    fn emit_tree(&mut self, tree_oid: ObjectId, path: &str) -> Result<(), String> {
        let mut stack: Vec<(ObjectId, String)> = vec![(tree_oid, path.to_string())];
        while let Some((oid, path)) = stack.pop() {
            if self.skip(&oid) {
                continue;
            }
            let (kind, body) =
                read_object(self.reader, &oid).ok_or_else(|| format!("missing tree object {}", oid.to_hex()))?;
            if kind != ObjectKind::Tree {
                return Err(format!("object {} is not a tree", oid.to_hex()));
            }
            self.emit(&oid, kind, &body, Some(&path))?;
            let ObjectRef::Tree(tree) = ObjectRef::from_bytes(kind, &body)
                .map_err(|e| format!("corrupt tree {}: {}", oid.to_hex(), e))?
            else {
                continue;
            };
            let mut subtrees = Vec::new();
            for entry in &tree.entries {
                let child = entry.oid.to_owned();
                let child_path = join_path(&path, &String::from_utf8_lossy(entry.filename));
                if entry.mode.is_tree() {
                    subtrees.push((child, child_path));
                } else if entry.mode.is_commit() {
                    // Submodule (gitlink): the commit lives in another repository.
                } else if !self.skip(&child) {
                    let (bkind, bbody) = read_object(self.reader, &child)
                        .ok_or_else(|| format!("missing blob object {}", child.to_hex()))?;
                    self.emit(&child, bkind, &bbody, Some(&child_path))?;
                }
            }
            // Reverse so subtrees are processed in tree order.
            stack.extend(subtrees.into_iter().rev());
        }
        Ok(())
    }

    /// Record everything reachable from `tree_oid` as present on the client (thin-pack bases).
    fn mark_client_tree(&mut self, tree_oid: ObjectId) {
        let mut stack: Vec<(ObjectId, String)> = vec![(tree_oid, String::new())];
        while let Some((oid, path)) = stack.pop() {
            if !self.client_has.insert(oid) {
                continue;
            }
            self.client_paths.entry(path.clone()).or_insert(oid);
            let Some((kind, body)) = read_object(self.reader, &oid) else { continue };
            let Ok(ObjectRef::Tree(tree)) = ObjectRef::from_bytes(kind, &body) else { continue };
            for entry in &tree.entries {
                let child = entry.oid.to_owned();
                let child_path = join_path(&path, &String::from_utf8_lossy(entry.filename));
                if entry.mode.is_tree() {
                    stack.push((child, child_path));
                } else if !entry.mode.is_commit() && self.client_has.insert(child) {
                    self.client_paths.entry(child_path).or_insert(child);
                }
            }
        }
    }
}

fn join_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{}/{}", prefix, name)
    }
}

// ---------------------------------------------------------------------------------------------
// Ref advertisement (`GET info/refs`)
// ---------------------------------------------------------------------------------------------

/// Capabilities advertised for `git-upload-pack`; every one of them is implemented in this module.
pub const UPLOAD_PACK_CAPABILITIES: &str =
    "multi_ack multi_ack_detailed thin-pack side-band side-band-64k ofs-delta shallow no-progress include-tag allow-tip-sha1-in-want allow-reachable-sha1-in-want";
/// Capabilities advertised for `git-receive-pack` (implemented in `git_server::handle_receive_pack`).
pub const RECEIVE_PACK_CAPABILITIES: &str = "report-status delete-refs side-band-64k quiet atomic ofs-delta";
const AGENT: &str = "agent=gitoxide-gas/0.3.0";

/// Build the Smart HTTP `info/refs` advertisement. For `git-upload-pack`, annotated tags are followed
/// by their peeled `<target> <ref>^{}` line like `git upload-pack` does (clients use them to auto-follow tags).
pub fn advertise_refs(
    reader: &mut dyn GitObjectReader,
    service: &str,
    head_symref: &str,
    head_oid: Option<ObjectId>,
    refs: &BTreeMap<String, ObjectId>,
) -> Result<Vec<u8>, String> {
    let upload = match service {
        "git-upload-pack" => true,
        "git-receive-pack" => false,
        other => {
            return Err(format!(
                "Unsupported Git Smart HTTP service '{}': expected 'git-upload-pack' or 'git-receive-pack'",
                other
            ))
        }
    };
    let capabilities = if upload {
        format!("{} symref=HEAD:{} object-format=sha1 {}", UPLOAD_PACK_CAPABILITIES, head_symref, AGENT)
    } else {
        format!("{} object-format=sha1 {}", RECEIVE_PACK_CAPABILITIES, AGENT)
    };

    let mut out = Vec::with_capacity(512);
    write_text(&mut out, &format!("# service={}", service))?;
    write_flush(&mut out)?;

    let mut lines: Vec<String> = Vec::new();
    if let Some(h) = head_oid {
        lines.push(format!("{} HEAD", h.to_hex()));
    }
    for (name, oid) in refs {
        lines.push(format!("{} {}", oid.to_hex(), name));
        if upload && name.starts_with("refs/tags/") {
            if let Some(peeled) = peeled_target(reader, oid) {
                lines.push(format!("{} {}^{{}}", peeled.to_hex(), name));
            }
        }
    }
    if lines.is_empty() {
        let zero = ObjectId::null(HashKind::Sha1);
        lines.push(format!("{} capabilities^{{}}", zero.to_hex()));
    }
    for (idx, line) in lines.iter().enumerate() {
        if idx == 0 {
            write_text(&mut out, &format!("{}\0{}", line, capabilities))?;
        } else {
            write_text(&mut out, line)?;
        }
    }
    write_flush(&mut out)?;
    Ok(out)
}

// ---------------------------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------------------------

fn write_text(out: &mut Vec<u8>, line: &str) -> Result<(), String> {
    pkt_encode::text_to_write(line.as_bytes(), out).map_err(|e| format!("pkt-line encode error: {}", e))?;
    Ok(())
}

fn write_flush(out: &mut Vec<u8>) -> Result<(), String> {
    pkt_encode::flush_to_write(out).map_err(|e| format!("pkt-line flush error: {}", e))?;
    Ok(())
}

/// Process one stateless `git-upload-pack` request and return the full response body.
///
/// `refs` is the ref map of the repository (used for `include-tag`).
pub fn handle_upload_pack_request(
    reader: &mut dyn GitObjectReader,
    refs: &BTreeMap<String, ObjectId>,
    body: &[u8],
) -> Result<Vec<u8>, String> {
    let req = UploadRequest::parse(body)?;
    let mut out = Vec::new();
    if req.wants.is_empty() {
        // git upload-pack sends nothing when the client wants nothing.
        return Ok(out);
    }

    let mut graph = Graph::new();
    if !req.haves.is_empty() || req.deepen.is_some() || !req.client_shallows.is_empty() {
        graph.load_index(reader);
    }

    // Validate wants and split them into commits (graph walk) and other objects (tags, trees, blobs).
    let mut want_commits: Vec<ObjectId> = Vec::new();
    let mut want_others: Vec<(ObjectId, ObjectKind)> = Vec::new();
    for want in &req.wants {
        let (kind, _) = read_object(reader, want).ok_or_else(|| format!("not our ref {}", want.to_hex()))?;
        match kind {
            ObjectKind::Commit => want_commits.push(*want),
            ObjectKind::Tag => {
                want_others.push((*want, kind));
                if let Some((_, target, ObjectKind::Commit)) = peel_tag(reader, want) {
                    want_commits.push(target);
                }
            }
            _ => want_others.push((*want, kind)),
        }
    }

    // Shallow-update section: only when the client asks to deepen (git sends none for plain
    // fetches into a shallow repository; the client's shallow commits still bound the pack).
    let client_shallows: HashSet<ObjectId> = req.client_shallows.iter().copied().collect();
    let shallow = match req.deepen {
        Some(depth) => compute_shallow(reader, &mut graph, &want_commits, &client_shallows, depth),
        None => ShallowInfo::default(),
    };
    if req.deepen.is_some() {
        for line in &shallow.lines {
            write_text(&mut out, line)?;
        }
        write_flush(&mut out)?;
    }
    if !req.negotiation {
        // EOF right after the want section: the client only wanted the shallow list.
        return Ok(out);
    }

    // Negotiation: mirrors git's get_common_commits() for one stateless round.
    // Shallow commits (client's and newly computed) act as parentless grafts for the give-up walk.
    let graft_boundary: HashSet<ObjectId> = client_shallows.union(&shallow.new_shallows).copied().collect();
    let detailed = req.has_cap("multi_ack_detailed");
    let multi_ack = detailed || req.has_cap("multi_ack");
    let mut commons: Vec<ObjectId> = Vec::new();
    let mut give_up = GiveUp::default();
    let (mut got_common, mut got_other, mut sent_ready) = (false, false, false);
    for have in &req.haves {
        if graph.has(reader, have) {
            got_common = true;
            let first = !commons.contains(have);
            if first {
                commons.push(*have);
                give_up.invalidate();
            }
            if detailed {
                write_text(&mut out, &format!("ACK {} common", have.to_hex()))?;
            } else if multi_ack {
                write_text(&mut out, &format!("ACK {} continue", have.to_hex()))?;
            } else if first && commons.len() == 1 {
                write_text(&mut out, &format!("ACK {}", have.to_hex()))?;
            }
        } else {
            got_other = true;
            if multi_ack && give_up.ok(reader, &mut graph, &want_commits, &commons, &graft_boundary) {
                if detailed {
                    sent_ready = true;
                    write_text(&mut out, &format!("ACK {} ready", have.to_hex()))?;
                } else {
                    write_text(&mut out, &format!("ACK {} continue", have.to_hex()))?;
                }
            }
        }
    }
    if !req.done {
        if detailed && got_common && !got_other && give_up.ok(reader, &mut graph, &want_commits, &commons, &graft_boundary) {
            if let Some(last) = commons.last() {
                sent_ready = true;
                write_text(&mut out, &format!("ACK {} ready", last.to_hex()))?;
            }
        }
        let _ = sent_ready;
        if commons.is_empty() || multi_ack {
            write_text(&mut out, "NAK")?;
        }
        return Ok(out);
    }
    match commons.last() {
        Some(last) if multi_ack => write_text(&mut out, &format!("ACK {}", last.to_hex()))?,
        Some(_) => {}
        None => write_text(&mut out, "NAK")?,
    }

    let pack = build_pack(reader, &mut graph, refs, &req, &want_commits, &want_others, &commons, &client_shallows, &shallow)?;
    let (pack_bytes, object_count) = pack;

    let use_sideband = req.has_cap("side-band-64k") || req.has_cap("side-band");
    if use_sideband {
        let limit = if req.has_cap("side-band-64k") { MAX_SIDEBAND_64K } else { MAX_SIDEBAND_1K };
        if !req.has_cap("no-progress") {
            let msg = format!("gitoxide-gas: Total {} objects, done.\n", object_count);
            pkt_encode::band_to_write(Channel::Progress, msg.as_bytes(), &mut out)
                .map_err(|e| format!("sideband progress error: {}", e))?;
        }
        for chunk in pack_bytes.chunks(limit) {
            pkt_encode::band_to_write(Channel::Data, chunk, &mut out)
                .map_err(|e| format!("sideband data error: {}", e))?;
        }
        write_flush(&mut out)?;
    } else {
        out.extend_from_slice(&pack_bytes);
    }
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
fn build_pack(
    reader: &mut dyn GitObjectReader,
    graph: &mut Graph,
    refs: &BTreeMap<String, ObjectId>,
    req: &UploadRequest,
    want_commits: &[ObjectId],
    want_others: &[(ObjectId, ObjectKind)],
    commons: &[ObjectId],
    client_shallows: &HashSet<ObjectId>,
    shallow: &ShallowInfo,
) -> Result<(Vec<u8>, u32), String> {
    // Commits the client has: ancestry of the common haves, stopping at shallow boundaries
    // (the client lacks the parents of its shallow commits).
    let mut client_commits: HashSet<ObjectId> = HashSet::default();
    let mut queue: VecDeque<ObjectId> = commons.iter().copied().collect();
    while let Some(c) = queue.pop_front() {
        if !client_commits.insert(c) {
            continue;
        }
        if client_shallows.contains(&c) || shallow.new_shallows.contains(&c) {
            continue;
        }
        queue.extend(graph.parents_of(reader, &c));
    }

    // Phase A: commits to send (newest first) and edge commits (client-side parents of sent commits).
    let boundary = |c: &ObjectId| {
        shallow.new_shallows.contains(c) || (client_shallows.contains(c) && !shallow.unshallowed.contains(c))
    };
    let mut send: Vec<(ObjectId, ObjectId)> = Vec::new(); // (commit, tree)
    let mut edges: Vec<ObjectId> = Vec::new();
    let mut visited: HashSet<ObjectId> = HashSet::default();
    let mut queue: VecDeque<ObjectId> = want_commits.iter().copied().collect();
    // Unshallowed commits are on the client, but their history is not: walk from their parents.
    let mut unshallowed: Vec<&ObjectId> = shallow.unshallowed.iter().collect();
    unshallowed.sort();
    for u in unshallowed {
        visited.insert(*u);
        queue.extend(graph.parents_of(reader, u));
    }
    while let Some(c) = queue.pop_front() {
        if !visited.insert(c) {
            continue;
        }
        if client_commits.contains(&c) {
            edges.push(c);
            continue;
        }
        let (tree, parents) = graph
            .read_commit(reader, &c)
            .ok_or_else(|| format!("missing commit object {}", c.to_hex()))?;
        send.push((c, tree));
        if !boundary(&c) {
            queue.extend(parents);
        }
    }

    let mut builder = PackBuilder {
        reader,
        writer: PackWriter::new(),
        use_ofs: req.has_cap("ofs-delta"),
        use_thin: req.has_cap("thin-pack"),
        client_has: HashSet::default(),
        client_paths: HashMap::default(),
        emitted: HashMap::default(),
        last_at_path: HashMap::default(),
    };

    // Phase B: trees of edge commits are on the client (skipped, and usable as thin-pack bases).
    for edge in edges.iter().take(MAX_EDGE_TREES) {
        if let Some((tree, _)) = graph.read_commit(builder.reader, edge) {
            builder.mark_client_tree(tree);
        }
    }

    // Phase C: emit objects.
    for (oid, kind) in want_others {
        let (kind2, body) = read_object(builder.reader, oid).ok_or_else(|| format!("missing object {}", oid.to_hex()))?;
        debug_assert_eq!(*kind, kind2);
        match kind2 {
            ObjectKind::Tag => {
                if let Some((chain, target, target_kind)) = peel_tag(builder.reader, oid) {
                    for t in chain {
                        if let Some((k, b)) = read_object(builder.reader, &t) {
                            builder.emit(&t, k, &b, None)?;
                        }
                    }
                    match target_kind {
                        ObjectKind::Tree => builder.emit_tree(target, "")?,
                        ObjectKind::Blob => {
                            if let Some((k, b)) = read_object(builder.reader, &target) {
                                builder.emit(&target, k, &b, None)?;
                            }
                        }
                        _ => {}
                    }
                }
            }
            ObjectKind::Tree => builder.emit_tree(*oid, "")?,
            _ => builder.emit(oid, kind2, &body, None)?,
        }
    }
    for (commit, tree) in &send {
        let (kind, body) =
            read_object(builder.reader, commit).ok_or_else(|| format!("missing commit object {}", commit.to_hex()))?;
        builder.emit(commit, kind, &body, None)?;
        builder.emit_tree(*tree, "")?;
    }

    // include-tag: annotated tags whose peeled target is part of this pack.
    if req.has_cap("include-tag") {
        for (name, oid) in refs {
            if !name.starts_with("refs/tags/") || builder.emitted.contains_key(oid) {
                continue;
            }
            let Some((chain, target, _)) = peel_tag(builder.reader, oid) else { continue };
            if chain.is_empty() || !builder.emitted.contains_key(&target) {
                continue;
            }
            for t in chain.into_iter().rev() {
                if let Some((k, b)) = read_object(builder.reader, &t) {
                    builder.emit(&t, k, &b, None)?;
                }
            }
        }
    }

    let count = builder.writer.count();
    Ok((builder.writer.finish()?, count))
}

#[cfg(test)]
mod tests;
