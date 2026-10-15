// gas:cache-service/gas-cache@0.1.0-alpha

export class GasCache {
	public readonly cache: GoogleAppsScript.Cache.Cache;

	constructor(cacheObject: GoogleAppsScript.Cache.Cache) {
		this.cache = cacheObject;
	}

	get(key: string): string | undefined {
		const val = this.cache.get(key);
		return val === null || val === undefined ? undefined : val;
	}

	getAll(keys: string[]): Array<[string, string]> {
		const raw = this.cache.getAll(keys) ?? {};
		return Object.entries(raw).map(([k, v]): [string, string] => [k, String(v)]);
	}

	put(key: string, value: string, expirationInSeconds?: number): void {
		if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
			this.cache.put(key, value, expirationInSeconds);
		} else {
			this.cache.put(key, value);
		}
	}

	putAll(values: Array<[string, string]>, expirationInSeconds?: number): void {
		const dict: { [key: string]: string } = Object.fromEntries(values);
		if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
			this.cache.putAll(dict, expirationInSeconds);
		} else {
			this.cache.putAll(dict);
		}
	}

	remove(key: string): void {
		this.cache.remove(key);
	}

	removeAll(keys: string[]): void {
		this.cache.removeAll(keys);
	}
}
