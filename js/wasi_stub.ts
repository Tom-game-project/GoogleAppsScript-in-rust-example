// GAS 上で WASI 0.2 が要求する最低限のエクスポートを満たすダミー実装

// wasi:cli/environment
export function getEnvironment(): Array<[string, string]> {
	return [];
}

export function getArguments(): string[] {
	return [];
}

export function initialCwd(): string | undefined {
	return undefined;
}

// wasi:cli/exit
export function exit(): void {}

// wasi:cli/terminal-*, wasi:io/*
export function getStdin(): null {
	return null;
}

export function getStdout(): null {
	return null;
}

export function getStderr(): null {
	return null;
}

// wasi:clocks/monotonic-clock
export function now(): bigint {
	return BigInt(Date.now()) * BigInt(1000000);
}

export function resolution(): bigint {
	return BigInt(1000000);
}

export function subscribeInstant(): void {}

export function subscribeDuration(): void {}

// wasi:io/streams
export class InputStream {}

export class OutputStream {
	blockingWriteAndFlush(_bytes: Uint8Array): void {
		// 必要なら Logger.log などに流す
	}
}

export class Error {}

export class Pollable {
	ready(): boolean {
		return true;
	}

	block(): void {
		// 同期環境なので何もしない
	}
}

export function poll(pollables: Pollable[]): number[] {
	return pollables.map((_, index) => index);
}
