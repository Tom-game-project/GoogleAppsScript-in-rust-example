// wasi:cli/*@0.3.2 & wasi:cli/*@0.2.0
import {
	InputStream,
	OutputStream,
	sharedStderr,
	sharedStdin,
	sharedStdout,
	throwWasiNotImplemented,
} from "./wasi-io";

// wasi:cli/environment (@0.3.2 & @0.2.0)
export function getEnvironment(): Array<[string, string]> {
	try {
		if (
			typeof PropertiesService !== "undefined" &&
			typeof PropertiesService.getScriptProperties === "function"
		) {
			const props = PropertiesService.getScriptProperties().getProperties();
			return Object.entries(props);
		}
	} catch {
		// スクリプトプロパティにアクセスできない場合は空リストを返す
	}
	return [];
}

export function getArguments(): string[] {
	// GAS は CLI 引数を持たないため空配列を返す
	return [];
}

// WASI 0.3.2: get-initial-cwd
export function getInitialCwd(): string | undefined {
	// GAS にはローカルファイルシステム上のカレントディレクトリが存在しないため仕様に従い none (undefined) を返す
	return undefined;
}

// WASI 0.2.0: initial-cwd
export function initialCwd(): string | undefined {
	return undefined;
}

// wasi:cli/exit (@0.3.2 & @0.2.0)
export function exit(status?: { tag: "ok" } | { tag: "err" }): never {
	const isErr = status !== undefined && status.tag === "err";
	throw new globalThis.Error(
		`[WASI Exit] Program terminated via wasi:cli/exit.exit (status=${isErr ? "err" : "ok"})`,
	);
}

export function exitWithCode(statusCode: number): never {
	throw new globalThis.Error(
		`[WASI Exit] Program terminated via wasi:cli/exit.exit-with-code (code=${statusCode})`,
	);
}

// wasi:cli/stdin, stdout, stderr (@0.2.0: Rust wasm32-wasip2 標準出力/標準エラー出力連携用)
export function getStdin(): InputStream {
	return sharedStdin;
}

export function getStdout(): OutputStream {
	return sharedStdout;
}

export function getStderr(): OutputStream {
	return sharedStderr;
}

// wasi:cli/stdin, stdout, stderr (@0.3.2: Component Model 0.3 stream<u8> / future は同期GASでは未サポート)
export function readViaStream(): never {
	return throwWasiNotImplemented(
		"wasi:cli/stdin",
		"read-via-stream",
		"Component Model 0.3 async stream<u8> stdin is not supported in Google Apps Script.",
	);
}

export function writeViaStream(_data: unknown): never {
	return throwWasiNotImplemented(
		"wasi:cli/stdout",
		"write-via-stream",
		"Component Model 0.3 async stream<u8> stdio is not supported in Google Apps Script. Use WASI 0.2 getStdout/getStderr (Rust println!/eprintln!) or gas:logger/logger.",
	);
}

// wasi:cli/terminal-* (@0.3.2 & @0.2.0)
export class TerminalInput {
	constructor() {
		throwWasiNotImplemented(
			"wasi:cli/terminal-input",
			"constructor",
			"Interactive TTY terminal input does not exist in Google Apps Script.",
		);
	}
}

export class TerminalOutput {
	constructor() {
		throwWasiNotImplemented(
			"wasi:cli/terminal-output",
			"constructor",
			"Interactive TTY terminal output does not exist in Google Apps Script.",
		);
	}
}

export function getTerminalStdin(): TerminalInput | undefined {
	// 仕様: stdin が端末に接続されていない場合は none (undefined) を返す
	return undefined;
}

export function getTerminalStdout(): TerminalOutput | undefined {
	// 仕様: stdout が端末に接続されていない場合は none (undefined) を返す
	return undefined;
}

export function getTerminalStderr(): TerminalOutput | undefined {
	// 仕様: stderr が端末に接続されていない場合は none (undefined) を返す
	return undefined;
}

// wasi:cli/run (@0.3.2)
export function run(): never {
	return throwWasiNotImplemented(
		"wasi:cli/run",
		"run",
		"wasi:cli/run async command world is not supported as a host import in Google Apps Script.",
	);
}
