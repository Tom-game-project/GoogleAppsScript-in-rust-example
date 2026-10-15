// gas:drive-app/gas-drive-app@0.1.0-alpha
import { unwrapBlob } from "./gas-driveapp-blob";
import {
	CreateFileInput,
	GasFile,
	GasFileIterator,
	GasFolder,
	GasFolderIterator,
	unwrapFile,
	unwrapFolder,
} from "./gas-driveapp-file";

export function addFile(child: GasFile): GasFolder {
	return new GasFolder(DriveApp.addFile(unwrapFile(child)));
}

export function addFolder(child: GasFolder): GasFolder {
	return new GasFolder(DriveApp.addFolder(unwrapFolder(child)));
}

export function continueFileIterator(continuationToken: string): GasFileIterator {
	return new GasFileIterator(DriveApp.continueFileIterator(continuationToken));
}

export function continueFolderIterator(continuationToken: string): GasFolderIterator {
	return new GasFolderIterator(DriveApp.continueFolderIterator(continuationToken));
}

export function createFile(input: CreateFileInput): GasFile {
	if (input.tag === "from-blob") {
		return new GasFile(DriveApp.createFile(unwrapBlob(input.val)));
	}
	const { name, content, mimeType } = input.val;
	if (mimeType !== undefined && mimeType !== null) {
		return new GasFile(DriveApp.createFile(name, content, mimeType));
	}
	return new GasFile(DriveApp.createFile(name, content));
}

export function createFolder(name: string): GasFolder {
	return new GasFolder(DriveApp.createFolder(name));
}

export function createShortcut(targetId: string): GasFile {
	return new GasFile(DriveApp.createShortcut(targetId));
}

export function getFileById(id: string): GasFile | undefined {
	const f = DriveApp.getFileById(id);
	if (f === null || f === undefined) {
		return undefined;
	}
	return new GasFile(f);
}

export function getFiles(): GasFileIterator {
	return new GasFileIterator(DriveApp.getFiles());
}

export function getFilesByName(name: string): GasFileIterator {
	return new GasFileIterator(DriveApp.getFilesByName(name));
}

export function getFilesByType(mimeType: string): GasFileIterator {
	return new GasFileIterator(DriveApp.getFilesByType(mimeType));
}

export function getFolderById(id: string): GasFolder | undefined {
	const f = DriveApp.getFolderById(id);
	if (f === null || f === undefined) {
		return undefined;
	}
	return new GasFolder(f);
}

export function getFolders(): GasFolderIterator {
	return new GasFolderIterator(DriveApp.getFolders());
}

export function getFoldersByName(name: string): GasFolderIterator {
	return new GasFolderIterator(DriveApp.getFoldersByName(name));
}

export function getRootFolder(): GasFolder {
	return new GasFolder(DriveApp.getRootFolder());
}

export function getStorageLimit(): bigint {
	return BigInt(Math.trunc(DriveApp.getStorageLimit()));
}

export function getStorageUsed(): bigint {
	return BigInt(Math.trunc(DriveApp.getStorageUsed()));
}

export function getTrashedFiles(): GasFileIterator {
	return new GasFileIterator(DriveApp.getTrashedFiles());
}

export function getTrashedFolders(): GasFolderIterator {
	return new GasFolderIterator(DriveApp.getTrashedFolders());
}

export function removeFile(child: GasFile): GasFolder {
	return new GasFolder(DriveApp.removeFile(unwrapFile(child)));
}

export function removeFolder(child: GasFolder): GasFolder {
	return new GasFolder(DriveApp.removeFolder(unwrapFolder(child)));
}

export function searchFiles(params: string): GasFileIterator {
	return new GasFileIterator(DriveApp.searchFiles(params));
}

export function searchFolders(params: string): GasFolderIterator {
	return new GasFolderIterator(DriveApp.searchFolders(params));
}
