// wasi:clocks/types@0.3.2, wasi:clocks/system-clock@0.3.2, wasi:clocks/timezone@0.3.2

export type Duration = bigint;

export interface Instant {
	seconds: bigint;
	nanoseconds: number;
}

// wasi:clocks/system-clock@0.3.2
export function now(): Instant {
	const ms = Date.now();
	const seconds = BigInt(Math.floor(ms / 1000));
	const remMs = ((ms % 1000) + 1000) % 1000;
	const nanoseconds = remMs * 1_000_000;
	return { seconds, nanoseconds };
}

export function getResolution(): Duration {
	// Date.now() の分解能 (1ミリ秒 = 1,000,000ナノ秒)
	return 1_000_000n;
}

// wasi:clocks/timezone@0.3.2
export function ianaId(): string | undefined {
	try {
		if (
			typeof Session !== "undefined" &&
			typeof Session.getScriptTimeZone === "function"
		) {
			const tz = Session.getScriptTimeZone();
			return tz && tz.length > 0 ? tz : undefined;
		}
	} catch {
		// 権限や実行コンテキストにより取得できない場合は仕様に従い none (undefined) を返す
	}
	return undefined;
}

export function utcOffset(when: Instant): bigint | undefined {
	try {
		const tz = ianaId();
		if (
			tz !== undefined &&
			typeof Utilities !== "undefined" &&
			typeof Utilities.formatDate === "function"
		) {
			const epochMs =
				Number(when.seconds) * 1000 + Math.floor(when.nanoseconds / 1_000_000);
			const date = new Date(epochMs);
			// RFC 822 タイムゾーンオフセット (例: "+0900", "-0400")
			const formatted = Utilities.formatDate(date, tz, "Z");
			const match = /^([+-])(\d{2})(\d{2})$/.exec(formatted);
			if (match !== null) {
				const sign = match[1] === "-" ? -1n : 1n;
				const hours = BigInt(parseInt(match[2], 10));
				const minutes = BigInt(parseInt(match[3], 10));
				const totalSeconds = sign * (hours * 3600n + minutes * 60n);
				return totalSeconds * 1_000_000_000n;
			}
		}
	} catch {
		// 取得失敗時は仕様に従い none (undefined) を返す
	}
	return undefined;
}

export function toDebugString(): string {
	const tz = ianaId();
	if (tz !== undefined) {
		return tz;
	}
	return "UTC (Google Apps Script Timezone Unavailable)";
}
