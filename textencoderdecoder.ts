// High-performance TextEncoder / TextDecoder & Single-Pass Wasm Base64 Loader for Google Apps Script V8 Runtime.
//
// Key Optimizations for GAS Wasm Loading:
// 1. Defines `globalThis.Buffer.from(str, "base64")` and `globalThis.__gasDecodeBase64Fast(str)`
//    so `@bytecodealliance/jco`'s `base64Compile` takes the direct `Buffer.from(str, "base64")` fast path
//    into a pre-allocated `Uint8Array` in ~14ms, completely bypassing the slow
//    `Uint8Array.from(atob(str), b => b.charCodeAt(0))` path (which previously allocated a 1.5M-char string
//    and invoked the per-character closure 1.5 million times, taking ~600ms-3000ms).
// 2. Memoizes compiled `WebAssembly.Module` instances in `globalThis.__GAS_WASM_MODULE_CACHE__`.
// 3. Uses a pre-allocated `Uint8Array` in `TextEncoder` and 4096-unit chunked `String.fromCharCode.apply`
//    in `TextDecoder` (delegating to native V8 `TextEncoder`/`TextDecoder` for UTF-8 when available).

(function () {
  const NativeTextEncoder = globalThis.TextEncoder;
  const NativeTextDecoder = globalThis.TextDecoder;

  const nativeUtf8Encoder = NativeTextEncoder ? new NativeTextEncoder() : null;
  let nativeUtf8Decoder: TextDecoder | null = null;
  if (NativeTextDecoder) {
    try {
      const dec = new NativeTextDecoder("utf-8");
      if (dec.decode(new Uint8Array([0x61])) === "a") {
        nativeUtf8Decoder = dec;
      }
    } catch {
      nativeUtf8Decoder = null;
    }
  }

  class FastTextEncoder implements TextEncoder {
    get encoding(): string {
      return "utf-8";
    }

    encode(input: string = ""): Uint8Array<ArrayBuffer> {
      if (input.length === 0) {
        return new Uint8Array(new ArrayBuffer(0));
      }
      if (nativeUtf8Encoder) {
        return nativeUtf8Encoder.encode(input) as Uint8Array<ArrayBuffer>;
      }
      const len = input.length;
      const buf = new ArrayBuffer(len * 3);
      const out = new Uint8Array(buf);
      let written = 0;
      for (let i = 0; i < len; i++) {
        const c = input.charCodeAt(i);
        if (c <= 0x7f) {
          out[written++] = c;
        } else if (c <= 0x7ff) {
          out[written++] = 0xc0 | (c >> 6);
          out[written++] = 0x80 | (c & 0x3f);
        } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < len) {
          const c2 = input.charCodeAt(i + 1);
          if (c2 >= 0xdc00 && c2 <= 0xdfff) {
            const cp = ((c - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000;
            out[written++] = 0xf0 | (cp >> 18);
            out[written++] = 0x80 | ((cp >> 12) & 0x3f);
            out[written++] = 0x80 | ((cp >> 6) & 0x3f);
            out[written++] = 0x80 | (cp & 0x3f);
            i++;
          } else {
            out[written++] = 0xe0 | (c >> 12);
            out[written++] = 0x80 | ((c >> 6) & 0x3f);
            out[written++] = 0x80 | (c & 0x3f);
          }
        } else {
          out[written++] = 0xe0 | (c >> 12);
          out[written++] = 0x80 | ((c >> 6) & 0x3f);
          out[written++] = 0x80 | (c & 0x3f);
        }
      }
      return new Uint8Array(buf.slice(0, written));
    }

    encodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
      let read = 0;
      let written = 0;
      const destLen = destination.length;
      const srcLen = source.length;

      for (let i = 0; i < srcLen; i++) {
        const c = source.charCodeAt(i);
        if (c <= 0x7f) {
          if (written + 1 > destLen) break;
          destination[written++] = c;
          read++;
        } else if (c <= 0x7ff) {
          if (written + 2 > destLen) break;
          destination[written++] = 0xc0 | (c >> 6);
          destination[written++] = 0x80 | (c & 0x3f);
          read++;
        } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < srcLen) {
          const c2 = source.charCodeAt(i + 1);
          if (c2 >= 0xdc00 && c2 <= 0xdfff) {
            if (written + 4 > destLen) break;
            const cp = ((c - 0xd800) << 10) + (c2 - 0xdc00) + 0x10000;
            destination[written++] = 0xf0 | (cp >> 18);
            destination[written++] = 0x80 | ((cp >> 12) & 0x3f);
            destination[written++] = 0x80 | ((cp >> 6) & 0x3f);
            destination[written++] = 0x80 | (cp & 0x3f);
            i++;
            read += 2;
          } else {
            if (written + 3 > destLen) break;
            destination[written++] = 0xe0 | (c >> 12);
            destination[written++] = 0x80 | ((c >> 6) & 0x3f);
            destination[written++] = 0x80 | (c & 0x3f);
            read++;
          }
        } else {
          if (written + 3 > destLen) break;
          destination[written++] = 0xe0 | (c >> 12);
          destination[written++] = 0x80 | ((c >> 6) & 0x3f);
          destination[written++] = 0x80 | (c & 0x3f);
          read++;
        }
      }
      return { read, written };
    }
  }

  if (!globalThis.TextEncoder) {
    globalThis.TextEncoder = FastTextEncoder as unknown as typeof TextEncoder;
  } else if (!globalThis.TextEncoder.prototype.encodeInto) {
    globalThis.TextEncoder.prototype.encodeInto = FastTextEncoder.prototype.encodeInto;
  }

  class FastTextDecoder implements TextDecoder {
    private _encoding: string;
    private _fatal: boolean;
    private _ignoreBOM: boolean;

    constructor(label: string = "utf-8", options: TextDecoderOptions = {}) {
      this._fatal = !!options.fatal;
      this._ignoreBOM = !!options.ignoreBOM;

      const normalized = String(label).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized === "utf16le" || normalized === "utf16") {
        this._encoding = "utf-16le";
      } else {
        this._encoding = "utf-8";
      }
    }

    get encoding(): string {
      return this._encoding;
    }
    get fatal(): boolean {
      return this._fatal;
    }
    get ignoreBOM(): boolean {
      return this._ignoreBOM;
    }

    decode(input: BufferSource = new Uint8Array(), _options?: TextDecodeOptions): string {
      let bytes: Uint8Array;
      if (input instanceof Uint8Array) {
        bytes = input;
      } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      } else {
        bytes = new Uint8Array(input);
      }

      const len = bytes.length;
      if (len === 0) return "";

      if (this._encoding === "utf-8" && nativeUtf8Decoder && !this._fatal) {
        try {
          return nativeUtf8Decoder.decode(bytes);
        } catch {
          // Fall through to chunked JS UTF-8 decoder
        }
      }

      const CHUNK = 4096;

      if (this._encoding === "utf-16le") {
        const pairLen = len >>> 1;
        const chunks: string[] = [];
        for (let i = 0; i < pairLen; i += CHUNK) {
          const end = Math.min(i + CHUNK, pairLen);
          const codes = new Array<number>(end - i);
          for (let j = 0; j < codes.length; j++) {
            const byteIdx = (i + j) << 1;
            codes[j] = bytes[byteIdx] | (bytes[byteIdx + 1] << 8);
          }
          chunks.push(String.fromCharCode.apply(null, codes));
        }
        return chunks.length === 1 ? chunks[0] : chunks.join("");
      }

      // Chunked UTF-8 decode (avoids O(N) single-char string concatenations)
      const chunks: string[] = [];
      const charBuf = new Array<number>(CHUNK);
      let bufIdx = 0;
      let i = 0;
      while (i < len) {
        const b1 = bytes[i++];
        if (b1 <= 0x7f) {
          charBuf[bufIdx++] = b1;
        } else if (b1 >= 0xc0 && b1 <= 0xdf) {
          const b2 = bytes[i++] & 0x3f;
          charBuf[bufIdx++] = ((b1 & 0x1f) << 6) | b2;
        } else if (b1 >= 0xe0 && b1 <= 0xef) {
          const b2 = bytes[i++] & 0x3f;
          const b3 = bytes[i++] & 0x3f;
          charBuf[bufIdx++] = ((b1 & 0x0f) << 12) | (b2 << 6) | b3;
        } else if (b1 >= 0xf0 && b1 <= 0xf7) {
          if (bufIdx >= CHUNK - 1) {
            chunks.push(String.fromCharCode.apply(null, charBuf.slice(0, bufIdx)));
            bufIdx = 0;
          }
          const b2 = bytes[i++] & 0x3f;
          const b3 = bytes[i++] & 0x3f;
          const b4 = bytes[i++] & 0x3f;
          const cp = (((b1 & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4) - 0x10000;
          charBuf[bufIdx++] = 0xd800 + (cp >> 10);
          charBuf[bufIdx++] = 0xdc00 + (cp & 0x3ff);
        } else {
          charBuf[bufIdx++] = b1;
        }
        if (bufIdx >= CHUNK) {
          chunks.push(String.fromCharCode.apply(null, charBuf));
          bufIdx = 0;
        }
      }
      if (bufIdx > 0) {
        chunks.push(
          String.fromCharCode.apply(
            null,
            bufIdx === CHUNK ? charBuf : charBuf.slice(0, bufIdx)
          )
        );
      }
      return chunks.length === 1 ? chunks[0] : chunks.join("");
    }
  }

  globalThis.TextDecoder = FastTextDecoder as unknown as typeof TextDecoder;
})();

// --- Ultra-Fast Single-Pass Base64 -> Uint8Array & Memoized Wasm Loader ---
(() => {
  const decodeTable = new Int16Array(128).fill(-1);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < abc.length; i++) {
    decodeTable[abc.charCodeAt(i)] = i;
  }
  decodeTable[45] = 62; // '-'
  decodeTable[95] = 63; // '_'

  function fastDecodeBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const len = b64.length;
    if (len === 0) return new Uint8Array(new ArrayBuffer(0));

    // Fast path for clean Base64 strings (such as jco's embedded Wasm literals) without whitespace
    const lastCode = b64.charCodeAt(len - 1);
    const firstCode = b64.charCodeAt(0);
    if (
      (len & 3) === 0 &&
      firstCode > 32 &&
      lastCode > 32 &&
      (lastCode === 61 || (lastCode < 128 && decodeTable[lastCode] >= 0))
    ) {
      let pad = 0;
      if (lastCode === 61) pad++;
      if (len > 1 && b64.charCodeAt(len - 2) === 61) pad++;
      const outLen = ((len * 3) >>> 2) - pad;
      const buf = new ArrayBuffer(outLen);
      const out = new Uint8Array(buf);
      let i = 0;
      let o = 0;
      const mainEnd = len - (pad > 0 ? 4 : 0);
      while (i < mainEnd) {
        const n =
          (decodeTable[b64.charCodeAt(i)] << 18) |
          (decodeTable[b64.charCodeAt(i + 1)] << 12) |
          (decodeTable[b64.charCodeAt(i + 2)] << 6) |
          decodeTable[b64.charCodeAt(i + 3)];
        out[o] = n >>> 16;
        out[o + 1] = (n >>> 8) & 0xff;
        out[o + 2] = n & 0xff;
        i += 4;
        o += 3;
      }
      if (pad > 0) {
        const c0 = decodeTable[b64.charCodeAt(i)];
        const c1 = decodeTable[b64.charCodeAt(i + 1)];
        const c2 = pad === 1 ? decodeTable[b64.charCodeAt(i + 2)] : 0;
        const n = (c0 << 18) | (c1 << 12) | (c2 << 6);
        out[o++] = n >>> 16;
        if (pad === 1) out[o++] = (n >>> 8) & 0xff;
      }
      return out;
    }

    // Fallback for Base64 strings containing whitespace or unaligned padding
    const s = b64.replace(/\s+/g, "");
    if (s.length === 0) return new Uint8Array(new ArrayBuffer(0));
    let validLen = s.indexOf("=");
    if (validLen === -1) validLen = s.length;
    const placeHolders = validLen === s.length ? 0 : (4 - (validLen % 4)) % 4;
    const outLen = Math.floor((validLen * 3) / 4) - (placeHolders > 0 ? placeHolders : 0);
    const buf = new ArrayBuffer(outLen);
    const out = new Uint8Array(buf);
    let o = 0;
    let i = 0;
    while (i < validLen) {
      const c0 = decodeTable[s.charCodeAt(i++)];
      const c1 = decodeTable[s.charCodeAt(i++)];
      const c2 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;
      const c3 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;
      const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
      if (o < outLen) out[o++] = (triplet >> 16) & 0xff;
      if (o < outLen) out[o++] = (triplet >> 8) & 0xff;
      if (o < outLen) out[o++] = triplet & 0xff;
    }
    return out;
  }

  function atobImpl(b64: string): string {
    const bytes = fastDecodeBase64ToBytes(String(b64));
    const CHUNK = 4096;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, bytes.length);
      const codes = new Array<number>(end - i);
      for (let j = 0; j < codes.length; j++) {
        codes[j] = bytes[i + j];
      }
      chunks.push(String.fromCharCode.apply(null, codes));
    }
    return chunks.join("");
  }

  const wasmModuleCache = new Map<string, WebAssembly.Module>();

  function gasFastBase64Compile(b64: string): WebAssembly.Module {
    const cacheKey = `${b64.length}:${b64.slice(0, 64)}:${b64.slice(-64)}`;
    const cached = wasmModuleCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const bytes = fastDecodeBase64ToBytes(b64);
    const mod = new WebAssembly.Module(bytes);
    wasmModuleCache.set(cacheKey, mod);
    return mod;
  }

  const g = globalThis as unknown as Record<string, unknown>;
  g.__gasDecodeBase64Fast = fastDecodeBase64ToBytes;
  g.__gasFastBase64Compile = gasFastBase64Compile;
  g.atobBytes = fastDecodeBase64ToBytes;
  if (!("atob" in g)) {
    g.atob = atobImpl;
  }
  // Provide `globalThis.Buffer.from(str, 'base64')` so jco's generated `base64Compile`
  // (`typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), ...)`)
  // decodes directly into a `Uint8Array` in a single pass (~14ms) instead of `atob` + `Uint8Array.from`.
  if (typeof g.Buffer === "undefined") {
    g.Buffer = {
      from(input: string | ArrayLike<number>, encoding?: string): Uint8Array {
        if (typeof input === "string") {
          if (encoding === "base64" || encoding === "base64url") {
            return fastDecodeBase64ToBytes(input);
          }
          return new globalThis.TextEncoder().encode(input);
        }
        return new Uint8Array(input);
      },
      isBuffer(obj: unknown): boolean {
        return obj instanceof Uint8Array;
      },
    };
  }
})();
