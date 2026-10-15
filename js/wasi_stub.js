// src/wasi_stub.js
// GAS 上で WASI 0.2 が要求する最低限のエクスポートを満たすダミー実装

// wasi:cli/environment
export function getEnvironment() { return []; }
export function getArguments() { return []; }
export function initialCwd() { return undefined; }

// wasi:cli/exit
export function exit() {}

// wasi:cli/terminal-*, wasi:io/*
export function getStdin() { return null; }
export function getStdout() { return null; }
export function getStderr() { return null; }

// wasi:clocks/monotonic-clock
export function now() { return BigInt(Date.now()) * 1000000n; }
export function resolution() { return 1000000n; }
export function subscribeInstant() {}
export function subscribeDuration() {}

// wasi:io/streams
export class InputStream {}
export class OutputStream {
  blockingWriteAndFlush(bytes) {
    // 必要なら Logger.log などに流す
  }
}
export class Error {}

export class Pollable {
  ready() {
    return true;
  }
  block() {
    // 同期環境なので何もしない
  }
}

/**
 * pollable のリストを受け取り、準備完了したインデックスを返す
 */
export function poll(pollables) {
  // すべて即座に完了しているものとしてインデックスの配列を返す
  return pollables.map((_, index) => index);
}
