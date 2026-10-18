// wasi:sockets/types@0.3.2 & wasi:sockets/ip-name-lookup@0.3.2 (および @0.2.0 互換)
// Google Apps Script ランタイムは生の TCP/UDP ソケット通信および直接の DNS 名前解決を提供していないため、
// すべての操作で未実装エラーを明確に送出します。

import { throwWasiNotImplemented } from "./wasi-io";

const SOCKETS_NOT_SUPPORTED_MSG =
	"Raw TCP/UDP sockets and low-level DNS resolution are not supported in the Google Apps Script runtime.";

export type IpAddressFamily = "ipv4" | "ipv6";

export class TcpSocket {
	constructor() {
		throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.constructor",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	static create(_addressFamily: IpAddressFamily): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.create",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	bind(_localAddress: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.bind",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	connect(_remoteAddress: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.connect",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	listen(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.listen",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	send(_data: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.send",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	receive(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.receive",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getLocalAddress(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-local-address",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getRemoteAddress(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-remote-address",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getIsListening(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-is-listening",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getAddressFamily(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-address-family",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setListenBacklogSize(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-listen-backlog-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getKeepAliveEnabled(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-keep-alive-enabled",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setKeepAliveEnabled(_value: boolean): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-keep-alive-enabled",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getKeepAliveIdleTime(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-keep-alive-idle-time",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setKeepAliveIdleTime(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-keep-alive-idle-time",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getKeepAliveInterval(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-keep-alive-interval",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setKeepAliveInterval(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-keep-alive-interval",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getKeepAliveCount(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-keep-alive-count",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setKeepAliveCount(_value: number): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-keep-alive-count",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getHopLimit(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-hop-limit",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setHopLimit(_value: number): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-hop-limit",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getReceiveBufferSize(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-receive-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setReceiveBufferSize(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-receive-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getSendBufferSize(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.get-send-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setSendBufferSize(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"tcp-socket.set-send-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}
}

export class UdpSocket {
	constructor() {
		throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.constructor",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	static create(_addressFamily: IpAddressFamily): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.create",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	bind(_localAddress: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.bind",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	connect(_remoteAddress: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.connect",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	disconnect(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.disconnect",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	send(_data: Uint8Array, _remoteAddress?: unknown): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.send",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	receive(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.receive",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getLocalAddress(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-local-address",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getRemoteAddress(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-remote-address",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getAddressFamily(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-address-family",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getUnicastHopLimit(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-unicast-hop-limit",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setUnicastHopLimit(_value: number): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.set-unicast-hop-limit",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getReceiveBufferSize(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-receive-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setReceiveBufferSize(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.set-receive-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	getSendBufferSize(): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.get-send-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}

	setSendBufferSize(_value: bigint): never {
		return throwWasiNotImplemented(
			"wasi:sockets/types",
			"udp-socket.set-send-buffer-size",
			SOCKETS_NOT_SUPPORTED_MSG,
		);
	}
}

// wasi:sockets/ip-name-lookup
export function resolveAddresses(_name: string): never {
	return throwWasiNotImplemented(
		"wasi:sockets/ip-name-lookup",
		"resolve-addresses",
		SOCKETS_NOT_SUPPORTED_MSG,
	);
}
