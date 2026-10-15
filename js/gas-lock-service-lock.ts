// gas:lock-service/gas-lock@0.1.0-alpha

export class GasLock {
	public readonly lock: GoogleAppsScript.Lock.Lock;

	constructor(lockObject: GoogleAppsScript.Lock.Lock) {
		this.lock = lockObject;
	}

	hasLock(): boolean {
		return Boolean(this.lock.hasLock());
	}

	releaseLock(): void {
		this.lock.releaseLock();
	}

	tryLock(timeoutInMillis: number): boolean {
		return Boolean(this.lock.tryLock(timeoutInMillis));
	}

	waitLock(timeoutInMillis: number): void {
		this.lock.waitLock(timeoutInMillis);
	}
}
