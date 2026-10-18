// wasi:filesystem/types@0.3.2 & wasi:filesystem/preopens@0.3.2 (および @0.2.0 互換)
// Google Apps Script には POSIX ファイルシステムが存在しないため、
// 曖昧・無理やりな擬似実装は行わず、呼び出し時に未実装であることを明確に通知します。
// Google ドライブのファイル操作には gas:drive-app パッケージを使用してください。

import { Error as IoError, throwWasiNotImplemented } from "./wasi-io";

const FS_NOT_SUPPORTED_MSG =
	"POSIX filesystem is not available in Google Apps Script. Use gas:drive-app/gas-drive-app (DriveApp) instead.";

export type ErrorCode =
	| { tag: "access" }
	| { tag: "already" }
	| { tag: "bad-descriptor" }
	| { tag: "busy" }
	| { tag: "deadlock" }
	| { tag: "quota" }
	| { tag: "exist" }
	| { tag: "file-too-large" }
	| { tag: "illegal-byte-sequence" }
	| { tag: "in-progress" }
	| { tag: "interrupted" }
	| { tag: "invalid" }
	| { tag: "io" }
	| { tag: "is-directory" }
	| { tag: "loop" }
	| { tag: "too-many-links" }
	| { tag: "message-size" }
	| { tag: "name-too-long" }
	| { tag: "no-device" }
	| { tag: "no-entry" }
	| { tag: "no-lock" }
	| { tag: "insufficient-memory" }
	| { tag: "insufficient-space" }
	| { tag: "not-directory" }
	| { tag: "not-empty" }
	| { tag: "not-recoverable" }
	| { tag: "unsupported" }
	| { tag: "no-tty" }
	| { tag: "no-such-device" }
	| { tag: "overflow" }
	| { tag: "not-permitted" }
	| { tag: "pipe" }
	| { tag: "read-only" }
	| { tag: "invalid-seek" }
	| { tag: "text-file-busy" }
	| { tag: "cross-device" }
	| { tag: "other"; val: string | undefined };

export class DirectoryEntryStream {
	readDirectoryEntry(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"directory-entry-stream.read-directory-entry",
			FS_NOT_SUPPORTED_MSG,
		);
	}
}

export class Descriptor {
	readViaStream(_offset: bigint): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.read-via-stream",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	writeViaStream(_data: unknown, _offset?: bigint): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.write-via-stream",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	appendViaStream(_data?: unknown): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.append-via-stream",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	advise(_offset: bigint, _length: bigint, _advice: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.advise",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	syncData(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.sync-data",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	getFlags(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.get-flags",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	getType(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.get-type",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	setSize(_size: bigint): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.set-size",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	setTimes(
		_dataAccessTimestamp: unknown,
		_dataModificationTimestamp: unknown,
	): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.set-times",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	read(_length: bigint, _offset: bigint): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.read",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	write(_buffer: Uint8Array, _offset: bigint): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.write",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	readDirectory(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.read-directory",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	sync(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.sync",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	createDirectoryAt(_path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.create-directory-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	stat(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.stat",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	statAt(_pathFlags: unknown, _path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.stat-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	setTimesAt(
		_pathFlags: unknown,
		_path: string,
		_dataAccessTimestamp: unknown,
		_dataModificationTimestamp: unknown,
	): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.set-times-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	linkAt(
		_oldPathFlags: unknown,
		_oldPath: string,
		_newDescriptor: Descriptor,
		_newPath: string,
	): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.link-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	openAt(
		_pathFlags: unknown,
		_path: string,
		_openFlags: unknown,
		_flags: unknown,
	): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.open-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	readlinkAt(_path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.readlink-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	removeDirectoryAt(_path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.remove-directory-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	renameAt(
		_oldPath: string,
		_newDescriptor: Descriptor,
		_newPath: string,
	): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.rename-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	symlinkAt(_oldPath: string, _newPath: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.symlink-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	unlinkFileAt(_path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.unlink-file-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	isSameObject(_other: Descriptor): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.is-same-object",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	metadataHash(): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.metadata-hash",
			FS_NOT_SUPPORTED_MSG,
		);
	}

	metadataHashAt(_pathFlags: unknown, _path: string): never {
		return throwWasiNotImplemented(
			"wasi:filesystem/types",
			"descriptor.metadata-hash-at",
			FS_NOT_SUPPORTED_MSG,
		);
	}
}

export function filesystemErrorCode(_err: IoError): ErrorCode | undefined {
	return { tag: "unsupported" };
}

// wasi:filesystem/preopens
export function getDirectories(): Array<[Descriptor, string]> {
	return throwWasiNotImplemented(
		"wasi:filesystem/preopens",
		"get-directories",
		FS_NOT_SUPPORTED_MSG,
	);
}
