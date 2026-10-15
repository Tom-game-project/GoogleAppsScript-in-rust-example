(function () {
  // --- TextEncoder (encode / encodeInto) ---
  class PolyfillTextEncoder implements TextEncoder {
    get encoding(): string {
      return "utf-8";
    }

    encode(input: string = ""): Uint8Array<ArrayBuffer> {
      const bytes: number[] = [];
      for (let i = 0; i < input.length; i++) {
        const cp = input.codePointAt(i)!;
        if (cp <= 0x7f) {
          bytes.push(cp);
        } else if (cp <= 0x7ff) {
          bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp <= 0xffff) {
          bytes.push(
            0xe0 | (cp >> 12),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f)
          );
        } else {
          bytes.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f)
          );
          i++; // サロゲートペアをスキップ
        }
      }
      const buffer = new ArrayBuffer(bytes.length);
      const u8 = new Uint8Array(buffer);
      u8.set(bytes);
      return u8;
    }

    encodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
      let read = 0;
      let written = 0;
      const destLen = destination.length;

      for (let i = 0; i < source.length; i++) {
        const cp = source.codePointAt(i)!;
        let needed = 1;
        if (cp > 0x7f) {
          if (cp <= 0x7ff) needed = 2;
          else if (cp <= 0xffff) needed = 3;
          else needed = 4;
        }

        if (written + needed > destLen) break;

        if (needed === 1) {
          destination[written++] = cp;
        } else if (needed === 2) {
          destination[written++] = 0xc0 | (cp >> 6);
          destination[written++] = 0x80 | (cp & 0x3f);
        } else if (needed === 3) {
          destination[written++] = 0xe0 | (cp >> 12);
          destination[written++] = 0x80 | ((cp >> 6) & 0x3f);
          destination[written++] = 0x80 | (cp & 0x3f);
        } else {
          destination[written++] = 0xf0 | (cp >> 18);
          destination[written++] = 0x80 | ((cp >> 12) & 0x3f);
          destination[written++] = 0x80 | ((cp >> 6) & 0x3f);
          destination[written++] = 0x80 | (cp & 0x3f);
          i++;
          read++;
        }
        read++;
      }
      return { read, written };
    }
  }

  if (!globalThis.TextEncoder) {
    globalThis.TextEncoder = PolyfillTextEncoder as unknown as typeof TextEncoder;
  } else if (!globalThis.TextEncoder.prototype.encodeInto) {
    globalThis.TextEncoder.prototype.encodeInto = PolyfillTextEncoder.prototype.encodeInto;
  }

  // --- TextDecoder (utf-8 / utf-16le) ---
  class PolyfillTextDecoder implements TextDecoder {
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
        bytes = new Uint8Array(
          input.buffer,
          input.byteOffset,
          input.byteLength
        );
      } else {
        bytes = new Uint8Array(input);
      }

      if (bytes.length === 0) return "";

      // UTF-16LE デコード
      if (this._encoding === "utf-16le") {
        const len = Math.floor(bytes.length / 2);
        const chars: string[] = [];
        const CHUNK = 0x4000;
        for (let i = 0; i < len; i += CHUNK) {
          const end = Math.min(i + CHUNK, len);
          const codes: number[] = new Array(end - i);
          for (let j = 0; j < codes.length; j++) {
            const byteIdx = (i + j) * 2;
            codes[j] = bytes[byteIdx] | (bytes[byteIdx + 1] << 8);
          }
          chars.push(String.fromCharCode(...codes));
        }
        return chars.join("");
      }

      // UTF-8 デコード
      let result = "";
      let i = 0;
      while (i < bytes.length) {
        const b1 = bytes[i++];
        if (b1 <= 0x7f) {
          result += String.fromCharCode(b1);
        } else if (b1 >= 0xc0 && b1 <= 0xdf) {
          const b2 = bytes[i++] & 0x3f;
          result += String.fromCharCode(((b1 & 0x1f) << 6) | b2);
        } else if (b1 >= 0xe0 && b1 <= 0xef) {
          const b2 = bytes[i++] & 0x3f;
          const b3 = bytes[i++] & 0x3f;
          result += String.fromCharCode(((b1 & 0x0f) << 12) | (b2 << 6) | b3);
        } else if (b1 >= 0xf0 && b1 <= 0xf7) {
          const b2 = bytes[i++] & 0x3f;
          const b3 = bytes[i++] & 0x3f;
          const b4 = bytes[i++] & 0x3f;
          const cp = (((b1 & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4) - 0x10000;
          result += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
          result += String.fromCharCode(b1);
        }
      }
      return result;
    }
  }

  // GAS 標準の TextDecoder は utf-16le で例外を投げるため常にポリフィルを優先
  globalThis.TextDecoder = PolyfillTextDecoder as unknown as typeof TextDecoder;
})();

// --- atob / atobBytes (Base64 decode) ---
(() => {
  interface GlobalWithBase64 {
    atob?: (b64: string) => string;
    atobBytes?: (b64: string) => Uint8Array;
  }

  const g = globalThis as unknown as GlobalWithBase64;
  if (!("atob" in g)) {
    const decodeTable = new Int16Array(256).fill(-1);
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (let i = 0; i < abc.length; i++) decodeTable[abc.charCodeAt(i)] = i;
    decodeTable["-".charCodeAt(0)] = 62;
    decodeTable["_".charCodeAt(0)] = 63;

    function _decodeBase64ToBytes(b64: string): Uint8Array {
      const s = b64.replace(/\s+/g, "");
      if (s.length === 0) return new Uint8Array(0);
      if (s.length % 4 === 1) throw new Error("Invalid base64 length");

      let validLen = s.indexOf("=");
      if (validLen === -1) validLen = s.length;
      const placeHolders = validLen === s.length ? 0 : (4 - (validLen % 4)) % 4;

      const outLen = Math.floor((validLen * 3) / 4) - (placeHolders > 0 ? placeHolders : 0);
      const out = new Uint8Array(outLen);

      let o = 0;
      let i = 0;

      while (i < validLen) {
        const c0 = decodeTable[s.charCodeAt(i++)];
        const c1 = decodeTable[s.charCodeAt(i++)];
        const c2 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;
        const c3 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;

        if (c0 < 0 || c1 < 0 || (i - 2 < validLen && c2 < 0) || (i - 1 < validLen && c3 < 0)) {
          throw new Error("Invalid base64 character");
        }

        const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
        if (o < outLen) out[o++] = (triplet >> 16) & 0xff;
        if (o < outLen) out[o++] = (triplet >> 8) & 0xff;
        if (o < outLen) out[o++] = triplet & 0xff;
      }
      return out;
    }

    function atobImpl(b64: string): string {
      const bytes = _decodeBase64ToBytes(String(b64));
      const CHUNK = 0x8000;
      let out = "";
      for (let i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
      }
      return out;
    }

    function atobBytesImpl(b64: string): Uint8Array {
      return _decodeBase64ToBytes(String(b64));
    }

    g.atob = atobImpl;
    g.atobBytes = atobBytesImpl;
  }
})();
