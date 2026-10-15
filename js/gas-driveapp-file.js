// gas:drive-app/gas-file@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export function toWitAccess(access) {
	switch (access) {
		case DriveApp.Access.ANYONE:
			return "anyone";
		case DriveApp.Access.ANYONE_WITH_LINK:
			return "anyone-with-link";
		case DriveApp.Access.DOMAIN:
			return "domain";
		case DriveApp.Access.DOMAIN_WITH_LINK:
			return "domain-with-link";
		case DriveApp.Access.PRIVATE:
		default:
			return "private";
	}
}

export function fromWitAccess(access) {
	switch (access) {
		case "anyone":
			return DriveApp.Access.ANYONE;
		case "anyone-with-link":
			return DriveApp.Access.ANYONE_WITH_LINK;
		case "domain":
			return DriveApp.Access.DOMAIN;
		case "domain-with-link":
			return DriveApp.Access.DOMAIN_WITH_LINK;
		case "private":
		default:
			return DriveApp.Access.PRIVATE;
	}
}

export function toWitPermission(perm) {
	switch (perm) {
		case DriveApp.Permission.COMMENT:
			return "comment";
		case DriveApp.Permission.EDIT:
			return "edit";
		case DriveApp.Permission.ORGANIZER:
			return "organizer";
		case DriveApp.Permission.FILE_ORGANIZER:
			return "file-organizer";
		case DriveApp.Permission.OWNER:
			return "owner";
		case DriveApp.Permission.VIEW:
			return "view";
		case DriveApp.Permission.NONE:
		default:
			return "none";
	}
}

export function fromWitPermission(perm) {
	switch (perm) {
		case "comment":
			return DriveApp.Permission.COMMENT;
		case "edit":
			return DriveApp.Permission.EDIT;
		case "organizer":
			return DriveApp.Permission.ORGANIZER;
		case "file-organizer":
			return DriveApp.Permission.FILE_ORGANIZER;
		case "owner":
			return DriveApp.Permission.OWNER;
		case "view":
			return DriveApp.Permission.VIEW;
		case "none":
		default:
			return DriveApp.Permission.NONE;
	}
}

export class GasUser {
	/**
	 * @param {GoogleAppsScript.Drive.User | GoogleAppsScript.Base.User} userObject
	 */
	constructor(userObject) {
		this.user = userObject;
	}

	getDomain() {
		return typeof this.user.getDomain === "function" ? this.user.getDomain() : "";
	}

	getEmail() {
		return this.user.getEmail();
	}

	getName() {
		return typeof this.user.getName === "function" ? this.user.getName() : "";
	}

	getPhotoUrl() {
		if (typeof this.user.getPhotoUrl === "function") {
			const url = this.user.getPhotoUrl();
			return url === null || url === undefined ? undefined : url;
		}
		return undefined;
	}
};

export class GasFile {
	/**
	 * @param {GoogleAppsScript.Drive.File} fileObject
	 */
	constructor(fileObject) {
		this.file = fileObject;
	}

	addCommenter(emailAddress) {
		this.file.addCommenter(emailAddress);
		return this;
	}

	addCommenters(emailAddresses) {
		this.file.addCommenters(emailAddresses);
		return this;
	}

	addEditor(emailAddress) {
		this.file.addEditor(emailAddress);
		return this;
	}

	addEditors(emailAddresses) {
		this.file.addEditors(emailAddresses);
		return this;
	}

	addViewer(emailAddress) {
		this.file.addViewer(emailAddress);
		return this;
	}

	addViewers(emailAddresses) {
		this.file.addViewers(emailAddresses);
		return this;
	}

	getAccess(email) {
		return toWitPermission(this.file.getAccess(email));
	}

	getAs(contentType) {
		return new GasBlob(this.file.getAs(contentType));
	}

	getBlob() {
		return new GasBlob(this.file.getBlob());
	}

	getDateCreated() {
		return BigInt(this.file.getDateCreated().getTime());
	}

	getDescription() {
		const desc = this.file.getDescription();
		return desc === null || desc === undefined ? undefined : desc;
	}

	getDownloadUrl() {
		const url = this.file.getDownloadUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getEditors() {
		return this.file.getEditors().map((u) => new GasUser(u));
	}

	getId() {
		return this.file.getId();
	}

	getLastUpdated() {
		return BigInt(this.file.getLastUpdated().getTime());
	}

	getMimeType() {
		return this.file.getMimeType();
	}

	getName() {
		return this.file.getName();
	}

	getOwner() {
		const owner = this.file.getOwner();
		return owner === null || owner === undefined ? undefined : new GasUser(owner);
	}

	getParents() {
		return new GasFolderIterator(this.file.getParents());
	}

	getSharingAccess() {
		return toWitAccess(this.file.getSharingAccess());
	}

	getSharingPermission() {
		return toWitPermission(this.file.getSharingPermission());
	}

	getSize() {
		return BigInt(Math.trunc(this.file.getSize()));
	}

	getTargetId() {
		const id = this.file.getTargetId();
		return id === null || id === undefined ? undefined : id;
	}

	getTargetMimeType() {
		const mt = this.file.getTargetMimeType();
		return mt === null || mt === undefined ? undefined : mt;
	}

	getThumbnail() {
		const thumb = this.file.getThumbnail();
		return thumb === null || thumb === undefined ? undefined : new GasBlob(thumb);
	}

	getUrl() {
		return this.file.getUrl();
	}

	getViewers() {
		return this.file.getViewers().map((u) => new GasUser(u));
	}

	isShareableByEditors() {
		return Boolean(this.file.isShareableByEditors());
	}

	isStarred() {
		return Boolean(this.file.isStarred());
	}

	isTrashed() {
		return Boolean(this.file.isTrashed());
	}

	makeCopy(options) {
		if (options === undefined || options === null) {
			return new GasFile(this.file.makeCopy());
		}
		const name = options.name ?? undefined;
		const dest = options.destination ? (options.destination.folder ?? options.destination) : undefined;
		if (name !== undefined && dest !== undefined) {
			return new GasFile(this.file.makeCopy(name, dest));
		}
		if (name !== undefined) {
			return new GasFile(this.file.makeCopy(name));
		}
		if (dest !== undefined) {
			return new GasFile(this.file.makeCopy(dest));
		}
		return new GasFile(this.file.makeCopy());
	}

	moveTo(destination) {
		const rawFolder = destination.folder ?? destination;
		this.file.moveTo(rawFolder);
		return this;
	}

	removeCommenter(emailAddress) {
		this.file.removeCommenter(emailAddress);
		return this;
	}

	removeEditor(emailAddress) {
		this.file.removeEditor(emailAddress);
		return this;
	}

	removeViewer(emailAddress) {
		this.file.removeViewer(emailAddress);
		return this;
	}

	revokePermissions(emailAddress) {
		this.file.revokePermissions(emailAddress);
		return this;
	}

	setContent(content) {
		this.file.setContent(content);
		return this;
	}

	setDescription(description) {
		this.file.setDescription(description);
		return this;
	}

	setName(name) {
		this.file.setName(name);
		return this;
	}

	setOwner(emailAddress) {
		this.file.setOwner(emailAddress);
		return this;
	}

	setShareableByEditors(shareable) {
		this.file.setShareableByEditors(Boolean(shareable));
		return this;
	}

	setSharing(accessType, permissionType) {
		this.file.setSharing(fromWitAccess(accessType), fromWitPermission(permissionType));
		return this;
	}

	setStarred(starred) {
		this.file.setStarred(Boolean(starred));
		return this;
	}

	setTrashed(trashed) {
		this.file.setTrashed(Boolean(trashed));
		return this;
	}
};

export class GasFolder {
	/**
	 * @param {GoogleAppsScript.Drive.Folder} folderObject
	 */
	constructor(folderObject) {
		this.folder = folderObject;
	}

	addEditor(emailAddress) {
		this.folder.addEditor(emailAddress);
		return this;
	}

	addEditors(emailAddresses) {
		this.folder.addEditors(emailAddresses);
		return this;
	}

	addFile(child) {
		this.folder.addFile(child.file ?? child);
		return this;
	}

	addFolder(child) {
		this.folder.addFolder(child.folder ?? child);
		return this;
	}

	addViewer(emailAddress) {
		this.folder.addViewer(emailAddress);
		return this;
	}

	addViewers(emailAddresses) {
		this.folder.addViewers(emailAddresses);
		return this;
	}

	createFile(input) {
		if (input.tag === "from-blob") {
			const rawBlob = input.val.blob ?? input.val;
			return new GasFile(this.folder.createFile(rawBlob));
		}
		const { name, content, mimeType } = input.val;
		if (mimeType !== undefined && mimeType !== null) {
			return new GasFile(this.folder.createFile(name, content, mimeType));
		}
		return new GasFile(this.folder.createFile(name, content));
	}

	createFolder(name) {
		return new GasFolder(this.folder.createFolder(name));
	}

	createShortcut(targetId) {
		return new GasFile(this.folder.createShortcut(targetId));
	}

	getAccess(email) {
		return toWitPermission(this.folder.getAccess(email));
	}

	getDateCreated() {
		return BigInt(this.folder.getDateCreated().getTime());
	}

	getDescription() {
		const desc = this.folder.getDescription();
		return desc === null || desc === undefined ? undefined : desc;
	}

	getEditors() {
		return this.folder.getEditors().map((u) => new GasUser(u));
	}

	getFiles() {
		return new GasFileIterator(this.folder.getFiles());
	}

	getFilesByName(name) {
		return new GasFileIterator(this.folder.getFilesByName(name));
	}

	getFilesByType(mimeType) {
		return new GasFileIterator(this.folder.getFilesByType(mimeType));
	}

	getFolders() {
		return new GasFolderIterator(this.folder.getFolders());
	}

	getFoldersByName(name) {
		return new GasFolderIterator(this.folder.getFoldersByName(name));
	}

	getId() {
		return this.folder.getId();
	}

	getLastUpdated() {
		return BigInt(this.folder.getLastUpdated().getTime());
	}

	getName() {
		return this.folder.getName();
	}

	getOwner() {
		const owner = this.folder.getOwner();
		return owner === null || owner === undefined ? undefined : new GasUser(owner);
	}

	getParents() {
		return new GasFolderIterator(this.folder.getParents());
	}

	getSharingAccess() {
		return toWitAccess(this.folder.getSharingAccess());
	}

	getSharingPermission() {
		return toWitPermission(this.folder.getSharingPermission());
	}

	getSize() {
		return BigInt(Math.trunc(this.folder.getSize()));
	}

	getUrl() {
		return this.folder.getUrl();
	}

	getViewers() {
		return this.folder.getViewers().map((u) => new GasUser(u));
	}

	isShareableByEditors() {
		return Boolean(this.folder.isShareableByEditors());
	}

	isStarred() {
		return Boolean(this.folder.isStarred());
	}

	isTrashed() {
		return Boolean(this.folder.isTrashed());
	}

	moveTo(destination) {
		this.folder.moveTo(destination.folder ?? destination);
		return this;
	}

	removeEditor(emailAddress) {
		this.folder.removeEditor(emailAddress);
		return this;
	}

	removeFile(child) {
		this.folder.removeFile(child.file ?? child);
		return this;
	}

	removeFolder(child) {
		this.folder.removeFolder(child.folder ?? child);
		return this;
	}

	removeViewer(emailAddress) {
		this.folder.removeViewer(emailAddress);
		return this;
	}

	revokePermissions(emailAddress) {
		this.folder.revokePermissions(emailAddress);
		return this;
	}

	searchFiles(params) {
		return new GasFileIterator(this.folder.searchFiles(params));
	}

	searchFolders(params) {
		return new GasFolderIterator(this.folder.searchFolders(params));
	}

	setDescription(description) {
		this.folder.setDescription(description);
		return this;
	}

	setName(name) {
		this.folder.setName(name);
		return this;
	}

	setOwner(emailAddress) {
		this.folder.setOwner(emailAddress);
		return this;
	}

	setShareableByEditors(shareable) {
		this.folder.setShareableByEditors(Boolean(shareable));
		return this;
	}

	setSharing(accessType, permissionType) {
		this.folder.setSharing(fromWitAccess(accessType), fromWitPermission(permissionType));
		return this;
	}

	setStarred(starred) {
		this.folder.setStarred(Boolean(starred));
		return this;
	}

	setTrashed(trashed) {
		this.folder.setTrashed(Boolean(trashed));
		return this;
	}
};

export class GasFileIterator {
	/**
	 * @param {GoogleAppsScript.Drive.FileIterator} iteratorObject
	 */
	constructor(iteratorObject) {
		this.iterator = iteratorObject;
	}

	getContinuationToken() {
		return this.iterator.getContinuationToken();
	}

	hasNext() {
		return Boolean(this.iterator.hasNext());
	}

	next() {
		return new GasFile(this.iterator.next());
	}
};

export class GasFolderIterator {
	/**
	 * @param {GoogleAppsScript.Drive.FolderIterator} iteratorObject
	 */
	constructor(iteratorObject) {
		this.iterator = iteratorObject;
	}

	getContinuationToken() {
		return this.iterator.getContinuationToken();
	}

	hasNext() {
		return Boolean(this.iterator.hasNext());
	}

	next() {
		return new GasFolder(this.iterator.next());
	}
};
