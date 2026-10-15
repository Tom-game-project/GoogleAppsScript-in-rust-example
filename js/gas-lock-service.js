// gas:lock-service/gas-lock-service@0.1.0-alpha
import { GasLock } from "./gas-lock-service-lock";

export function getDocumentLock() {
	const l = LockService.getDocumentLock();
	return l === null || l === undefined ? undefined : new GasLock(l);
};

export function getScriptLock() {
	return new GasLock(LockService.getScriptLock());
};

export function getUserLock() {
	return new GasLock(LockService.getUserLock());
};
