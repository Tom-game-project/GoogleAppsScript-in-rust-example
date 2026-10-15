// gas:cache-service/gas-cache@0.1.0-alpha

export class GasCache {
	constructor(cacheObject) {
		this.cache = cacheObject;
	}

	get(key) {
		const val = this.cache.get(key);
		return val === null || val === undefined ? undefined : val;
	}

	getAll(keys) {
		const raw = this.cache.getAll(keys) || {};
		return Object.entries(raw);
	}

	put(key, value, expirationInSeconds) {
		if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
			this.cache.put(key, value, expirationInSeconds);
		} else {
			this.cache.put(key, value);
		}
	}

	putAll(values, expirationInSeconds) {
		const dict = Object.fromEntries(values);
		if (expirationInSeconds !== undefined && expirationInSeconds !== null) {
			this.cache.putAll(dict, expirationInSeconds);
		} else {
			this.cache.putAll(dict);
		}
	}

	remove(key) {
		this.cache.remove(key);
	}

	removeAll(keys) {
		this.cache.removeAll(keys);
	}
};
