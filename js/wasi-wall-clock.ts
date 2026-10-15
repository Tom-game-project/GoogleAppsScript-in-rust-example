// wasi:clocks/wall-clock@0.2.0 (wasm32-wasip2 標準ライブラリ互換用)

export interface Datetime {
	seconds: bigint;
	nanoseconds: number;
}

export function now(): Datetime {
	const ms = Date.now();
	const seconds = BigInt(Math.floor(ms / 1000));
	const nanoseconds = (((ms % 1000) + 1000) % 1000) * 1_000_000;
	return { seconds, nanoseconds };
}

export function resolution(): Datetime {
	return { seconds: 0n, nanoseconds: 1_000_000 };
}
