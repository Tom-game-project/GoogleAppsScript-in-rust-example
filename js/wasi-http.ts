// wasi:http/types@0.3.2, wasi:http/client@0.3.2, wasi:http/handler@0.3.2 (および @0.2.0 互換)
// WASI HTTP は非同期ストリーム (stream<u8> / future) やチャンク転送・トレーラー・低レベルタイムアウトを前提としており、
// Google Apps Script の同期バッファ型 UrlFetchApp に無理やり当てはめると仕様との乖離・曖昧さが生じるため、
// 呼び出し時に未実装であることを明確に通知します。
// GAS 上での HTTP 通信には gas:urlfetchapp/gas-url-fetch-app (UrlFetchApp) を使用してください。

import { Error as IoError, throwWasiNotImplemented } from "./wasi-io";

const HTTP_NOT_SUPPORTED_MSG =
	"Streaming WASI HTTP is not supported in the synchronous Google Apps Script runtime. Use gas:urlfetchapp/gas-url-fetch-app (UrlFetchApp) for HTTP requests and gas:content-service / gas:html-service for doGet/doPost responses.";

export class Fields {
	constructor() {
		throwWasiNotImplemented(
			"wasi:http/types",
			"fields.constructor",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	static fromList(_entries: Array<[string, Uint8Array]>): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.from-list",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	get(_name: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.get",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	has(_name: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.has",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	set(_name: string, _value: Uint8Array[]): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.set",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	delete(_name: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.delete",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getAndDelete(_name: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.get-and-delete",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	append(_name: string, _value: Uint8Array): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.append",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	copyAll(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.copy-all",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	entries(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.entries",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	clone(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"fields.clone",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

export class RequestOptions {
	constructor() {
		throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.constructor",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getConnectTimeout(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.get-connect-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setConnectTimeout(_duration?: bigint): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.set-connect-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getFirstByteTimeout(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.get-first-byte-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setFirstByteTimeout(_duration?: bigint): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.set-first-byte-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getBetweenBytesTimeout(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.get-between-bytes-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setBetweenBytesTimeout(_duration?: bigint): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.set-between-bytes-timeout",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	clone(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request-options.clone",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

// WASI 0.3.2 Request / Response
export class Request {
	static new(
		_headers: Fields,
		_contents: unknown,
		_trailers: unknown,
		_options?: RequestOptions,
	): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.new",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getMethod(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-method",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setMethod(_method: unknown): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.set-method",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getPathWithQuery(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-path-with-query",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setPathWithQuery(_pathWithQuery?: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.set-path-with-query",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getScheme(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-scheme",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setScheme(_scheme?: unknown): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.set-scheme",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getAuthority(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-authority",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setAuthority(_authority?: string): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.set-authority",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getOptions(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-options",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getHeaders(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.get-headers",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	static consumeBody(_this: Request, _res: unknown): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"request.consume-body",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

export class Response {
	static new(
		_headers: Fields,
		_contents: unknown,
		_trailers: unknown,
	): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"response.new",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getStatusCode(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"response.get-status-code",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	setStatusCode(_statusCode: number): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"response.set-status-code",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	getHeaders(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"response.get-headers",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}

	static consumeBody(_this: Response, _res: unknown): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"response.consume-body",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

// WASI 0.2.0 OutgoingRequest / IncomingResponse 互換クラス
export class OutgoingRequest {
	constructor(_headers?: Fields) {
		throwWasiNotImplemented(
			"wasi:http/types",
			"outgoing-request.constructor",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

export class IncomingResponse {
	status(): never {
		return throwWasiNotImplemented(
			"wasi:http/types",
			"incoming-response.status",
			HTTP_NOT_SUPPORTED_MSG,
		);
	}
}

export function httpErrorCode(_err: IoError): undefined {
	return undefined;
}

// wasi:http/client@0.3.2
export function send(_request: Request): never {
	return throwWasiNotImplemented(
		"wasi:http/client",
		"send",
		HTTP_NOT_SUPPORTED_MSG,
	);
}

// wasi:http/handler@0.3.2 & wasi:http/outgoing-handler@0.2.0
export function handle(_request: Request | OutgoingRequest, _options?: RequestOptions): never {
	return throwWasiNotImplemented(
		"wasi:http/handler",
		"handle",
		HTTP_NOT_SUPPORTED_MSG,
	);
}
