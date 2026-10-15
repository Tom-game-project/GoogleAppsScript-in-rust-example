// gas:lock-service/gas-lock@0.1.0-alpha

export class GasLock {
	constructor(lockObject) {
		this.lock = lockObject;
	}

	hasLock() {
		return Boolean(this.lock.hasLock());
	}

	releaseLock() {
		this.lock.releaseLock();
	}

	tryLock(timeoutInMillis) {
		return Boolean(this.lock.tryLock(timeoutInMillis));
	}

	waitLock(timeoutInMillis) {
		this.lock.waitLock(timeoutInMillis);
	}
};
