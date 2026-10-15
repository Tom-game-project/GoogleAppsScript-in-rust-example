// WASI 互換エクスポート集約モジュール
// 各機能モジュール (wasi-cli.ts, wasi-monotonic-clock.ts, wasi-io.ts) の実装を再エクスポートします。

export {
	getEnvironment,
	getArguments,
	getInitialCwd,
	initialCwd,
	exit,
	exitWithCode,
	getStdin,
	getStdout,
	getStderr,
	TerminalInput,
	TerminalOutput,
	getTerminalStdin,
	getTerminalStdout,
	getTerminalStderr,
} from "./wasi-cli";

export {
	now,
	getResolution,
	resolution,
	waitUntil,
	waitFor,
	subscribeInstant,
	subscribeDuration,
} from "./wasi-monotonic-clock";

export {
	WasiNotImplementedError,
	throwWasiNotImplemented,
	Error,
	Pollable,
	poll,
	InputStream,
	OutputStream,
} from "./wasi-io";
