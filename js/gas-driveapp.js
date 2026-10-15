// gas:drive-app/gas-drive-app@0.1.0-alpha
import {
	GasFile,
	GasFolder,
	GasFileIterator,
	GasFolderIterator,
} from "./gas-driveapp-file";

export function addFile(child) {
	return new GasFolder(DriveApp.addFile(child.file ?? child));
};

export function addFolder(child) {
	return new GasFolder(DriveApp.addFolder(child.folder ?? child));
};

export function continueFileIterator(continuationToken) {
	return new GasFileIterator(DriveApp.continueFileIterator(continuationToken));
};

export function continueFolderIterator(continuationToken) {
	return new GasFolderIterator(DriveApp.continueFolderIterator(continuationToken));
};

export function createFile(input) {
	if (input.tag === "from-blob") {
		const rawBlob = input.val.blob ?? input.val;
		return new GasFile(DriveApp.createFile(rawBlob));
	}
	const { name, content, mimeType } = input.val;
	if (mimeType !== undefined && mimeType !== null) {
		return new GasFile(DriveApp.createFile(name, content, mimeType));
	}
	return new GasFile(DriveApp.createFile(name, content));
};

export function createFolder(name) {
	return new GasFolder(DriveApp.createFolder(name));
};

export function createShortcut(targetId) {
	return new GasFile(DriveApp.createShortcut(targetId));
};

export function getFileById(id) {
	const f = DriveApp.getFileById(id);
	if (f === null || f === undefined) {
		return undefined;
	}
	return new GasFile(f);
};

export function getFiles() {
	return new GasFileIterator(DriveApp.getFiles());
};

export function getFilesByName(name) {
	return new GasFileIterator(DriveApp.getFilesByName(name));
};

export function getFilesByType(mimeType) {
	return new GasFileIterator(DriveApp.getFilesByType(mimeType));
};

export function getFolderById(id) {
	const f = DriveApp.getFolderById(id);
	if (f === null || f === undefined) {
		return undefined;
	}
	return new GasFolder(f);
};

export function getFolders() {
	return new GasFolderIterator(DriveApp.getFolders());
};

export function getFoldersByName(name) {
	return new GasFolderIterator(DriveApp.getFoldersByName(name));
};

export function getRootFolder() {
	return new GasFolder(DriveApp.getRootFolder());
};

export function getStorageLimit() {
	return BigInt(Math.trunc(DriveApp.getStorageLimit()));
};

export function getStorageUsed() {
	return BigInt(Math.trunc(DriveApp.getStorageUsed()));
};

export function getTrashedFiles() {
	return new GasFileIterator(DriveApp.getTrashedFiles());
};

export function getTrashedFolders() {
	return new GasFolderIterator(DriveApp.getTrashedFolders());
};

export function removeFile(child) {
	return new GasFolder(DriveApp.removeFile(child.file ?? child));
};

export function removeFolder(child) {
	return new GasFolder(DriveApp.removeFolder(child.folder ?? child));
};

export function searchFiles(params) {
	return new GasFileIterator(DriveApp.searchFiles(params));
};

export function searchFolders(params) {
	return new GasFolderIterator(DriveApp.searchFolders(params));
};
