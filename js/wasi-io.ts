// wasi:io/streams@0.2.0 & wasi:io/poll@0.2.0 & wasi:io/error@0.2.0
// Google Apps Script (V8 同期ランタイム) 向けの WASI I/O 実装および未実装エラー定義

export class WasiNotImplementedError extends globalThis.Error {
	public readonly interfaceName: string;
	public readonly methodName: string;

	constructor(interfaceName: string, methodName: string, detail?: string) {
		const suffix = detail ? ` ${detail}` : "";
		super(
			`[WASI Not Implemented on GAS] ${interfaceName}.${methodName} is not supported in Google Apps Script.${suffix}`,
		);
		this.name = "WasiNotImplementedError";
		this.interfaceName = interfaceName;
		this.methodName = methodName;
	}
}

export function throwWasiNotImplemented(
	interfaceName: string,
	methodName: string,
	detail?: string,
): never {
	throw new WasiNotImplementedError(interfaceName, methodName, detail);
}

// wasi:io/error@0.2.0
export class Error {
	private readonly msg: string;

	constructor(msg: string = "WASI I/O Error") {
		this.msg = msg;
	}

	toDebugString(): string {
		return this.msg;
	}
}

// wasi:io/poll@0.2.0
export class Pollable {
	private readonly checkReady: () => boolean;

	constructor(checkReady?: () => boolean) {
		this.checkReady = checkReady ?? (() => true);
	}

	ready(): boolean {
		return this.checkReady();
	}

	block(): void {
		if (!this.ready()) {
			throwWasiNotImplemented(
				"wasi:io/poll",
				"pollable.block",
				"Blocking on an unready asynchronous Pollable is not possible in the synchronous Google Apps Script runtime.",
			);
		}
	}
}

export function poll(pollables: Pollable[]): Uint32Array {
	const readyIndices: number[] = [];
	for (let i = 0; i < pollables.length; i++) {
		if (pollables[i].ready()) {
			readyIndices.push(i);
		}
	}
	if (pollables.length > 0 && readyIndices.length === 0) {
		throwWasiNotImplemented(
			"wasi:io/poll",
			"poll",
			"Asynchronous polling when no Pollable is ready is not supported in the synchronous Google Apps Script runtime.",
		);
	}
	return new Uint32Array(readyIndices);
}

// wasi:io/streams@0.2.0
export class InputStream {
	read(_len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"input-stream.read",
			"Standard input and streaming byte reads are not available in Google Apps Script.",
		);
	}

	blockingRead(_len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"input-stream.blocking-read",
			"Standard input and blocking byte stream reads are not available in Google Apps Script.",
		);
	}

	skip(_len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"input-stream.skip",
			"Input stream skipping is not available in Google Apps Script.",
		);
	}

	blockingSkip(_len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"input-stream.blocking-skip",
			"Input stream blocking skip is not available in Google Apps Script.",
		);
	}

	subscribe(): Pollable {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"input-stream.subscribe",
			"Input stream readiness subscription is not available in Google Apps Script.",
		);
	}
}

export class OutputStream {
	private buffer: string = "";
	private readonly isStderr: boolean;

	constructor(isStderr: boolean = false) {
		this.isStderr = isStderr;
	}

	checkWrite(): bigint {
		return 1024n * 1024n;
	}

	write(contents: Uint8Array): void {
		const text = new TextDecoder("utf-8").decode(contents);
		this.buffer += text;
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (this.isStderr) {
				console.error(line);
			} else {
				Logger.log(line);
			}
		}
	}

	blockingWriteAndFlush(contents: Uint8Array): void {
		this.write(contents);
		this.flush();
	}

	flush(): void {
		if (this.buffer.length > 0) {
			if (this.isStderr) {
				console.error(this.buffer);
			} else {
				Logger.log(this.buffer);
			}
			this.buffer = "";
		}
	}

	blockingFlush(): void {
		this.flush();
	}

	writeZeroes(len: bigint | number): void {
		const count = Math.max(0, Number(len));
		if (count > 0) {
			this.write(new Uint8Array(new ArrayBuffer(count)));
		}
	}

	blockingWriteZeroesAndFlush(len: bigint | number): void {
		this.writeZeroes(len);
		this.flush();
	}

	splice(_src: InputStream, _len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"output-stream.splice",
			"Stream splicing from InputStream is not supported in Google Apps Script.",
		);
	}

	blockingSplice(_src: InputStream, _len: bigint | number): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"output-stream.blocking-splice",
			"Blocking stream splicing from InputStream is not supported in Google Apps Script.",
		);
	}

	forward(_src: InputStream): never {
		return throwWasiNotImplemented(
			"wasi:io/streams",
			"output-stream.forward",
			"Stream forwarding from InputStream is not supported in Google Apps Script.",
		);
	}

	subscribe(): Pollable {
		return new Pollable(() => true);
	}
}

export const sharedStdin = new InputStream();
export const sharedStdout = new OutputStream(false);
export const sharedStderr = new OutputStream(true);
