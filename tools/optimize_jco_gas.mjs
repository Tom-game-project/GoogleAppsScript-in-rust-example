#!/usr/bin/env node
/**
 * Post-processes `@bytecodealliance/jco` transpiled output (`target/jco/GoogleAppsScript_in_rust_example.js`)
 * for the Google Apps Script V8 runtime:
 *
 * 1. Replaces `base64Compile` with `globalThis.__gasFastBase64Compile` (defined in `textencoderdecoder.ts`),
 *    which decodes Base64 directly into a `Uint8Array` in a single lookup-table pass (~14ms vs ~600ms)
 *    and memoizes the compiled `WebAssembly.Module` across repeated invocations.
 * 2. Replaces any standalone `Uint8Array.from(atob(str), b => b.charCodeAt(0))` fallback expressions
 *    with `globalThis.__gasDecodeBase64Fast(str)`.
 */

import fs from "node:fs";
import path from "node:path";

const targetPath = process.argv[2] || "target/jco/GoogleAppsScript_in_rust_example.js";
const resolved = path.resolve(targetPath);

if (!fs.existsSync(resolved)) {
  console.warn(`[optimize_jco_gas] Target file not found: ${resolved} (skipping)`);
  process.exit(0);
}

let src = fs.readFileSync(resolved, "utf8");
const originalLen = src.length;

// 1. Rewrite `function base64Compile(str) { ... }` or `const base64Compile = str => ...`
const base64CompileFnRegex =
  /function\s+base64Compile\s*\(\s*str\s*\)\s*\{\s*return\s+WebAssembly\.compile\([^;]+\);\s*\}/g;

const base64CompileArrowRegex =
  /const\s+base64Compile\s*=\s*str\s*=>\s*WebAssembly\.(?:compile|Module)\([^;]+\);/g;

const fastReplacement = `function base64Compile(str) {
  if (typeof globalThis.__gasFastBase64Compile === "function") {
    return globalThis.__gasFastBase64Compile(str);
  }
  const bytes = typeof globalThis.__gasDecodeBase64Fast === "function"
    ? globalThis.__gasDecodeBase64Fast(str)
    : (typeof Buffer !== "undefined" ? Buffer.from(str, "base64") : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
  return new WebAssembly.Module(bytes);
}`;

let patchedCount = 0;
if (base64CompileFnRegex.test(src)) {
  src = src.replace(base64CompileFnRegex, () => {
    patchedCount++;
    return fastReplacement;
  });
}
if (base64CompileArrowRegex.test(src)) {
  src = src.replace(base64CompileArrowRegex, () => {
    patchedCount++;
    return fastReplacement;
  });
}

// 2. Replace any remaining `Uint8Array.from(atob(str), b => b.charCodeAt(0))` expressions
const slowAtobRegex =
  /Uint8Array\.from\(\s*atob\(\s*([a-zA-Z0-9_$]+)\s*\)\s*,\s*([a-zA-Z0-9_$]+)\s*=>\s*\2\.charCodeAt\(\s*0\s*\)\s*\)/g;

src = src.replace(slowAtobRegex, (_match, varName) => {
  patchedCount++;
  return `(typeof globalThis.__gasDecodeBase64Fast === "function" ? globalThis.__gasDecodeBase64Fast(${varName}) : Buffer.from(${varName}, "base64"))`;
});

fs.writeFileSync(resolved, src, "utf8");
console.log(
  `[optimize_jco_gas] Optimized ${targetPath} (${patchedCount} Wasm Base64 loader patch(es) applied, ${originalLen} -> ${src.length} bytes)`
);
