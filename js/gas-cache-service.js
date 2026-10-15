// gas:cache-service/gas-cache-service@0.1.0-alpha
import { GasCache } from "./gas-cache-service-cache";

export function getDocumentCache() {
	const c = CacheService.getDocumentCache();
	return c === null || c === undefined ? undefined : new GasCache(c);
};

export function getScriptCache() {
	return new GasCache(CacheService.getScriptCache());
};

export function getUserCache() {
	return new GasCache(CacheService.getUserCache());
};
