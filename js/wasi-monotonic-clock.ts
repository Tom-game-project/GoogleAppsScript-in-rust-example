// wasi:clocks/monotonic-clock@0.3.2 & wasi:clocks/monotonic-clock@0.2.0
import { Pollable, throwWasiNotImplemented } from "./wasi-io";

const EPOCH_START_MS = Date.now();
let lastMarkNs = 0n;

export function now(): bigint {
	const elapsedMs = Math.max(0, Date.now() - EPOCH_START_MS);
	const currentNs = BigInt(elapsedMs) * 1_000_000n;
	if (currentNs < lastMarkNs) {
		return lastMarkNs;
	}
	lastMarkNs = currentNs;
	return currentNs;
}

// WASI 0.3.2: get-resolution
export function getResolution(): bigint {
	return 1_000_000n;
}

// WASI 0.2.0: resolution
export function resolution(): bigint {
	return 1_000_000n;
}

// WASI 0.3.2: wait-until / wait-for (async func のため同期GASランタイムでは未サポート)
export function waitUntil(_when: bigint): never {
	return throwWasiNotImplemented(
		"wasi:clocks/monotonic-clock",
		"wait-until",
		"Component Model 0.3 async clock waiting is not supported in the synchronous Google Apps Script runtime. Use gas:utilities/gas-utilities.sleep for synchronous sleep.",
	);
}

export function waitFor(_howLong: bigint): never {
	return throwWasiNotImplemented(
		"wasi:clocks/monotonic-clock",
		"wait-for",
		"Component Model 0.3 async clock waiting is not supported in the synchronous Google Apps Script runtime. Use gas:utilities/gas-utilities.sleep for synchronous sleep.",
	);
}

// WASI 0.2.0: subscribe-instant / subscribe-duration (非同期Pollableタイマーは同期GASランタイムでは未サポート)
export function subscribeInstant(_when: bigint): Pollable {
	return throwWasiNotImplemented(
		"wasi:clocks/monotonic-clock",
		"subscribe-instant",
		"Asynchronous timer Pollable subscriptions are not supported in the synchronous Google Apps Script runtime.",
	);
}

export function subscribeDuration(_when: bigint): Pollable {
	return throwWasiNotImplemented(
		"wasi:clocks/monotonic-clock",
		"subscribe-duration",
		"Asynchronous timer Pollable subscriptions are not supported in the synchronous Google Apps Script runtime.",
	);
}
