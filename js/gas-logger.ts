// gas:logger/logger@0.1.0-alpha

export function log(data: string): void {
	Logger.log(data);
}

export function clear(): void {
	Logger.clear();
}

export function getLog(): string {
	return Logger.getLog();
}
