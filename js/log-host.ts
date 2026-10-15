// wasi:logging/logging@0.1.0-draft

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "critical";

export function log(level: LogLevel, _ctx: string, message: string): void {
	switch (level) {
		case "trace":
		case "debug":
			console.debug(message);
			break;
		case "info":
			console.info(message);
			break;
		case "warn":
			console.warn(message);
			break;
		case "error":
		case "critical":
			console.error(message);
			break;
		default:
			console.log(message);
	}
}
