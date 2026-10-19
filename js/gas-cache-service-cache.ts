// gas:cache-service/gas-cache@0.1.0-alpha

export class GasCache {
	public readonly cache: GoogleAppsScript.Cache.Cache;

	constructor(cacheObject: GoogleAppsScript.Cache.Cache) {
		this.cache = cacheObject;
	}

	get(key: string): string | undefined {
		try {
			const val = this.cache.get(key);
			return val === null || val === undefined ? undefined : val;
		} catch {
			return undefined;
		}
	}

	getAll(keys: string[]): Array<[string, string]> {
		if (!keys || keys.length === 0) {
			return [];
		}
		try {
			const raw = this.cache.getAll(keys) ?? {};
			return Object.entries(raw).map(([k, v]): [string, string] => [k, String(v)]);
		} catch {
			return [];
		}
	}

	put(key: string, value: string, expirationInSeconds?: number): void {
		try {
			if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
				this.cache.put(key, value, expirationInSeconds);
			} else {
				this.cache.put(key, value);
			}
		} catch {
			// Ignore cache put errors (e.g. value > 100KB limit)
		}
	}

	putAll(values: Array<[string, string]>, expirationInSeconds?: number): void {
		if (!values || values.length === 0) {
			return;
		}
		try {
			const dict: { [key: string]: string } = Object.fromEntries(values);
			if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
				this.cache.putAll(dict, expirationInSeconds);
			} else {
				this.cache.putAll(dict);
			}
		} catch {
			// Ignore cache putAll errors
		}
	}

	remove(key: string): void {
		try {
			this.cache.remove(key);
		} catch {
			// Ignore
		}
	}

	removeAll(keys: string[]): void {
		if (!keys || keys.length === 0) {
			return;
		}
		try {
			this.cache.removeAll(keys);
		} catch {
			// Ignore
		}
	}
}
