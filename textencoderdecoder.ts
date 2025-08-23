(function () {
  if (!globalThis.TextEncoder) {
    class PolyfillTextEncoder {
      get encoding() {
        return "utf-8";
      }
      encode(input: string = ""): Uint8Array {
        const bytes: number[] = [];
        for (const ch of input) {
          const cp = ch.codePointAt(0)!;
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
          }
        }
        return new Uint8Array(bytes);
      }
    }
    globalThis.TextEncoder = PolyfillTextEncoder as any;
  }

  if (!globalThis.TextDecoder) {
    class PolyfillTextDecoder {
      private _fatal: boolean;
      private _ignoreBOM: boolean;
      constructor(label: string = "utf-8", options: any = {}) {
        this._fatal = !!options.fatal;
        this._ignoreBOM = !!options.ignoreBOM;
        if (!/^utf-?8$/i.test(label)) {
          throw new RangeError("Only UTF-8 supported");
        }
      }
      get encoding() {
        return "utf-8";
      }
      get fatal() {
        return this._fatal;
      }
      get ignoreBOM() {
        return this._ignoreBOM;
      }
      decode(input: BufferSource = new Uint8Array()): string {
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
        // 簡易 UTF-8 decode (詳細版は省略)
        let result = "";
        for (let i = 0; i < bytes.length; i++) {
          result += String.fromCharCode(bytes[i]);
        }
        return result;
      }
    }
    globalThis.TextDecoder = PolyfillTextDecoder as any;
  }
})();

// --- atob / atobBytes (Base64 decode) ---
(() => {
  // すでに atob があれば何もしない
  if (!('atob' in globalThis)) {
    const decodeTable = new Int16Array(256).fill(-1);
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < abc.length; i++) decodeTable[abc.charCodeAt(i)] = i;
    // URL-safe 変種
    decodeTable['-'.charCodeAt(0)] = 62;
    decodeTable['_'.charCodeAt(0)] = 63;

    function _decodeBase64ToBytes(b64: string): Uint8Array {
      // 空白・改行除去、URL-safe の変換（+ / へ寄せなくてもテーブル側で対応）
      const s = b64.replace(/\s+/g, '');

      if (s.length === 0) return new Uint8Array(0);
      if (s.length % 4 === 1) throw new Error('Invalid base64 length');

      let validLen = s.indexOf('=');
      if (validLen === -1) validLen = s.length;
      const placeHolders = validLen === s.length ? 0 : (4 - (validLen % 4)) % 4;

      const outLen = Math.floor((validLen * 3) / 4) - (placeHolders > 0 ? placeHolders : 0);
      const out = new Uint8Array(outLen);

      let o = 0;
      let i = 0;

      // 4文字ずつ処理
      while (i < validLen) {
        const c0 = decodeTable[s.charCodeAt(i++)];
        const c1 = decodeTable[s.charCodeAt(i++)];
        const c2 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;
        const c3 = i < validLen ? decodeTable[s.charCodeAt(i++)] : 0;

        if (c0 < 0 || c1 < 0 || (i - 2 < validLen && c2 < 0) || (i - 1 < validLen && c3 < 0)) {
          throw new Error('Invalid base64 character');
        }

        const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

        if (o < outLen) out[o++] = (triplet >> 16) & 0xFF;
        if (o < outLen) out[o++] = (triplet >> 8) & 0xFF;
        if (o < outLen) out[o++] = triplet & 0xFF;
      }
      return out;
    }

    // 仕様どおり：latin1(バイナリ)文字列を返す
    function atobImpl(b64: string): string {
      const bytes = _decodeBase64ToBytes(String(b64));
      // 0..255 のバイト列を 1文字=1byte の文字列へ
      const CHUNK = 0x8000;
      let out = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
      }
      return out;
    }

    // 便利関数：Uint8Array を返す（GASでバイナリ扱いに便利）
    function atobBytesImpl(b64: string): Uint8Array {
      return _decodeBase64ToBytes(String(b64));
    }

    // @ts-ignore
    globalThis.atob = atobImpl;
    // 型が無ければ any として扱われる。必要なら .d.ts で宣言を追加してください
    // @ts-ignore
    globalThis.atobBytes = atobBytesImpl;
  }
})();
