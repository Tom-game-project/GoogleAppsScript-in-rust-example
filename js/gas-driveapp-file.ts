// gas:drive-app/gas-file@0.1.0-alpha
import { GasBlob, unwrapBlob } from "./gas-driveapp-blob";

export type GasAccess =
	| "anyone"
	| "anyone-with-link"
	| "domain"
	| "domain-with-link"
	| "private";

export type GasPermission =
	| "comment"
	| "edit"
	| "none"
	| "organizer"
	| "owner"
	| "view";

export interface TextFileSpec {
	name: string;
	content: string;
	mimeType?: string;
}

export type CreateFileInput =
	| { tag: "from-blob"; val: GasBlob }
	| { tag: "from-text"; val: TextFileSpec };

export interface MakeCopyOptions {
	name?: string;
	destination?: GasFolder;
}

export function toWitAccess(access: GoogleAppsScript.Drive.Access): GasAccess {
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

export function fromWitAccess(access: GasAccess): GoogleAppsScript.Drive.Access {
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

export function toWitPermission(perm: GoogleAppsScript.Drive.Permission): GasPermission {
	switch (perm) {
		case DriveApp.Permission.COMMENT:
			return "comment";
		case DriveApp.Permission.EDIT:
			return "edit";
		case DriveApp.Permission.ORGANIZER:
			return "organizer";
		case DriveApp.Permission.OWNER:
			return "owner";
		case DriveApp.Permission.VIEW:
			return "view";
		case DriveApp.Permission.NONE:
		default:
			return "none";
	}
}

export function fromWitPermission(perm: GasPermission): GoogleAppsScript.Drive.Permission {
	switch (perm) {
		case "comment":
			return DriveApp.Permission.COMMENT;
		case "edit":
			return DriveApp.Permission.EDIT;
		case "organizer":
			return DriveApp.Permission.ORGANIZER;
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
	public readonly user: GoogleAppsScript.Drive.User | GoogleAppsScript.Base.User;

	constructor(userObject: GoogleAppsScript.Drive.User | GoogleAppsScript.Base.User) {
		this.user = userObject;
	}

	getDomain(): string {
		if ("getDomain" in this.user && typeof this.user.getDomain === "function") {
			return this.user.getDomain();
		}
		return "";
	}

	getEmail(): string {
		return this.user.getEmail();
	}

	getName(): string {
		if ("getName" in this.user && typeof this.user.getName === "function") {
			return this.user.getName();
		}
		return "";
	}

	getPhotoUrl(): string | undefined {
		if ("getPhotoUrl" in this.user && typeof this.user.getPhotoUrl === "function") {
			const url = this.user.getPhotoUrl();
			return url === null || url === undefined ? undefined : url;
		}
		return undefined;
	}
}

export class GasFile {
	public readonly file: GoogleAppsScript.Drive.File;

	constructor(fileObject: GoogleAppsScript.Drive.File) {
		this.file = fileObject;
	}

	addCommenter(emailAddress: string): GasFile {
		this.file.addCommenter(emailAddress);
		return this;
	}

	addCommenters(emailAddresses: string[]): GasFile {
		this.file.addCommenters(emailAddresses);
		return this;
	}

	addEditor(emailAddress: string): GasFile {
		this.file.addEditor(emailAddress);
		return this;
	}

	addEditors(emailAddresses: string[]): GasFile {
		this.file.addEditors(emailAddresses);
		return this;
	}

	addViewer(emailAddress: string): GasFile {
		this.file.addViewer(emailAddress);
		return this;
	}

	addViewers(emailAddresses: string[]): GasFile {
		this.file.addViewers(emailAddresses);
		return this;
	}

	getAccess(email: string): GasPermission {
		return toWitPermission(this.file.getAccess(email));
	}

	getAs(contentType: string): GasBlob {
		return new GasBlob(this.file.getAs(contentType));
	}

	getBlob(): GasBlob {
		return new GasBlob(this.file.getBlob());
	}

	getDateCreated(): bigint {
		return BigInt(this.file.getDateCreated().getTime());
	}

	getDescription(): string | undefined {
		const desc = this.file.getDescription();
		return desc === null || desc === undefined ? undefined : desc;
	}

	getDownloadUrl(): string | undefined {
		const url = this.file.getDownloadUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getEditors(): GasUser[] {
		return this.file.getEditors().map((u) => new GasUser(u));
	}

	getId(): string {
		return this.file.getId();
	}

	getLastUpdated(): bigint {
		return BigInt(this.file.getLastUpdated().getTime());
	}

	getMimeType(): string {
		return this.file.getMimeType();
	}

	getName(): string {
		return this.file.getName();
	}

	getOwner(): GasUser | undefined {
		const owner = this.file.getOwner();
		return owner === null || owner === undefined ? undefined : new GasUser(owner);
	}

	getParents(): GasFolderIterator {
		return new GasFolderIterator(this.file.getParents());
	}

	getSharingAccess(): GasAccess {
		return toWitAccess(this.file.getSharingAccess());
	}

	getSharingPermission(): GasPermission {
		return toWitPermission(this.file.getSharingPermission());
	}

	getSize(): bigint {
		return BigInt(Math.trunc(this.file.getSize()));
	}

	getTargetId(): string | undefined {
		const id = this.file.getTargetId();
		return id === null || id === undefined ? undefined : id;
	}

	getTargetMimeType(): string | undefined {
		const mt = this.file.getTargetMimeType();
		return mt === null || mt === undefined ? undefined : mt;
	}

	getThumbnail(): GasBlob | undefined {
		const thumb = this.file.getThumbnail();
		return thumb === null || thumb === undefined ? undefined : new GasBlob(thumb);
	}

	getUrl(): string {
		return this.file.getUrl();
	}

	getViewers(): GasUser[] {
		return this.file.getViewers().map((u) => new GasUser(u));
	}

	isShareableByEditors(): boolean {
		return Boolean(this.file.isShareableByEditors());
	}

	isStarred(): boolean {
		return Boolean(this.file.isStarred());
	}

	isTrashed(): boolean {
		return Boolean(this.file.isTrashed());
	}

	makeCopy(options?: MakeCopyOptions): GasFile {
		if (options === undefined || options === null) {
			return new GasFile(this.file.makeCopy());
		}
		const name = options.name ?? undefined;
		const dest = options.destination !== undefined && options.destination !== null
			? unwrapFolder(options.destination)
			: undefined;
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

	moveTo(destination: GasFolder): GasFile {
		this.file.moveTo(unwrapFolder(destination));
		return this;
	}

	removeCommenter(emailAddress: string): GasFile {
		this.file.removeCommenter(emailAddress);
		return this;
	}

	removeEditor(emailAddress: string): GasFile {
		this.file.removeEditor(emailAddress);
		return this;
	}

	removeViewer(emailAddress: string): GasFile {
		this.file.removeViewer(emailAddress);
		return this;
	}

	revokePermissions(emailAddress: string): GasFile {
		this.file.revokePermissions(emailAddress);
		return this;
	}

	setContent(content: string): GasFile {
		this.file.setContent(content);
		return this;
	}

	setDescription(description: string): GasFile {
		this.file.setDescription(description);
		return this;
	}

	setName(name: string): GasFile {
		this.file.setName(name);
		return this;
	}

	setOwner(emailAddress: string): GasFile {
		this.file.setOwner(emailAddress);
		return this;
	}

	setShareableByEditors(shareable: boolean): GasFile {
		this.file.setShareableByEditors(Boolean(shareable));
		return this;
	}

	setSharing(accessType: GasAccess, permissionType: GasPermission): GasFile {
		this.file.setSharing(fromWitAccess(accessType), fromWitPermission(permissionType));
		return this;
	}

	setStarred(starred: boolean): GasFile {
		this.file.setStarred(Boolean(starred));
		return this;
	}

	setTrashed(trashed: boolean): GasFile {
		this.file.setTrashed(Boolean(trashed));
		return this;
	}
}

export class GasFolder {
	public readonly folder: GoogleAppsScript.Drive.Folder;

	constructor(folderObject: GoogleAppsScript.Drive.Folder) {
		this.folder = folderObject;
	}

	addEditor(emailAddress: string): GasFolder {
		this.folder.addEditor(emailAddress);
		return this;
	}

	addEditors(emailAddresses: string[]): GasFolder {
		this.folder.addEditors(emailAddresses);
		return this;
	}

	addFile(child: GasFile): GasFolder {
		this.folder.addFile(unwrapFile(child));
		return this;
	}

	addFolder(child: GasFolder): GasFolder {
		this.folder.addFolder(unwrapFolder(child));
		return this;
	}

	addViewer(emailAddress: string): GasFolder {
		this.folder.addViewer(emailAddress);
		return this;
	}

	addViewers(emailAddresses: string[]): GasFolder {
		this.folder.addViewers(emailAddresses);
		return this;
	}

	createFile(input: CreateFileInput): GasFile {
		if (input.tag === "from-blob") {
			return new GasFile(this.folder.createFile(unwrapBlob(input.val)));
		}
		const { name, content, mimeType } = input.val;
		if (mimeType !== undefined && mimeType !== null) {
			return new GasFile(this.folder.createFile(name, content, mimeType));
		}
		return new GasFile(this.folder.createFile(name, content));
	}

	createFolder(name: string): GasFolder {
		return new GasFolder(this.folder.createFolder(name));
	}

	createShortcut(targetId: string): GasFile {
		return new GasFile(this.folder.createShortcut(targetId));
	}

	getAccess(email: string): GasPermission {
		return toWitPermission(this.folder.getAccess(email));
	}

	getDateCreated(): bigint {
		return BigInt(this.folder.getDateCreated().getTime());
	}

	getDescription(): string | undefined {
		const desc = this.folder.getDescription();
		return desc === null || desc === undefined ? undefined : desc;
	}

	getEditors(): GasUser[] {
		return this.folder.getEditors().map((u) => new GasUser(u));
	}

	getFiles(): GasFileIterator {
		return new GasFileIterator(this.folder.getFiles());
	}

	getFilesByName(name: string): GasFileIterator {
		return new GasFileIterator(this.folder.getFilesByName(name));
	}

	getFilesByType(mimeType: string): GasFileIterator {
		return new GasFileIterator(this.folder.getFilesByType(mimeType));
	}

	getFolders(): GasFolderIterator {
		return new GasFolderIterator(this.folder.getFolders());
	}

	getFoldersByName(name: string): GasFolderIterator {
		return new GasFolderIterator(this.folder.getFoldersByName(name));
	}

	getId(): string {
		return this.folder.getId();
	}

	getLastUpdated(): bigint {
		return BigInt(this.folder.getLastUpdated().getTime());
	}

	getName(): string {
		return this.folder.getName();
	}

	getOwner(): GasUser | undefined {
		const owner = this.folder.getOwner();
		return owner === null || owner === undefined ? undefined : new GasUser(owner);
	}

	getParents(): GasFolderIterator {
		return new GasFolderIterator(this.folder.getParents());
	}

	getSharingAccess(): GasAccess {
		return toWitAccess(this.folder.getSharingAccess());
	}

	getSharingPermission(): GasPermission {
		return toWitPermission(this.folder.getSharingPermission());
	}

	getSize(): bigint {
		return BigInt(Math.trunc(this.folder.getSize()));
	}

	getUrl(): string {
		return this.folder.getUrl();
	}

	getViewers(): GasUser[] {
		return this.folder.getViewers().map((u) => new GasUser(u));
	}

	isShareableByEditors(): boolean {
		return Boolean(this.folder.isShareableByEditors());
	}

	isStarred(): boolean {
		return Boolean(this.folder.isStarred());
	}

	isTrashed(): boolean {
		return Boolean(this.folder.isTrashed());
	}

	moveTo(destination: GasFolder): GasFolder {
		this.folder.moveTo(unwrapFolder(destination));
		return this;
	}

	removeEditor(emailAddress: string): GasFolder {
		this.folder.removeEditor(emailAddress);
		return this;
	}

	removeFile(child: GasFile): GasFolder {
		this.folder.removeFile(unwrapFile(child));
		return this;
	}

	removeFolder(child: GasFolder): GasFolder {
		this.folder.removeFolder(unwrapFolder(child));
		return this;
	}

	removeViewer(emailAddress: string): GasFolder {
		this.folder.removeViewer(emailAddress);
		return this;
	}

	revokePermissions(emailAddress: string): GasFolder {
		this.folder.revokePermissions(emailAddress);
		return this;
	}

	searchFiles(params: string): GasFileIterator {
		return new GasFileIterator(this.folder.searchFiles(params));
	}

	searchFolders(params: string): GasFolderIterator {
		return new GasFolderIterator(this.folder.searchFolders(params));
	}

	setDescription(description: string): GasFolder {
		this.folder.setDescription(description);
		return this;
	}

	setName(name: string): GasFolder {
		this.folder.setName(name);
		return this;
	}

	setOwner(emailAddress: string): GasFolder {
		this.folder.setOwner(emailAddress);
		return this;
	}

	setShareableByEditors(shareable: boolean): GasFolder {
		this.folder.setShareableByEditors(Boolean(shareable));
		return this;
	}

	setSharing(accessType: GasAccess, permissionType: GasPermission): GasFolder {
		this.folder.setSharing(fromWitAccess(accessType), fromWitPermission(permissionType));
		return this;
	}

	setStarred(starred: boolean): GasFolder {
		this.folder.setStarred(Boolean(starred));
		return this;
	}

	setTrashed(trashed: boolean): GasFolder {
		this.folder.setTrashed(Boolean(trashed));
		return this;
	}
}

export class GasFileIterator {
	public readonly iterator: GoogleAppsScript.Drive.FileIterator;

	constructor(iteratorObject: GoogleAppsScript.Drive.FileIterator) {
		this.iterator = iteratorObject;
	}

	getContinuationToken(): string {
		return this.iterator.getContinuationToken();
	}

	hasNext(): boolean {
		return Boolean(this.iterator.hasNext());
	}

	next(): GasFile {
		return new GasFile(this.iterator.next());
	}
}

export class GasFolderIterator {
	public readonly iterator: GoogleAppsScript.Drive.FolderIterator;

	constructor(iteratorObject: GoogleAppsScript.Drive.FolderIterator) {
		this.iterator = iteratorObject;
	}

	getContinuationToken(): string {
		return this.iterator.getContinuationToken();
	}

	hasNext(): boolean {
		return Boolean(this.iterator.hasNext());
	}

	next(): GasFolder {
		return new GasFolder(this.iterator.next());
	}
}

export function unwrapFile(file: GasFile | GoogleAppsScript.Drive.File): GoogleAppsScript.Drive.File {
	return file instanceof GasFile ? file.file : file;
}

export function unwrapFolder(folder: GasFolder | GoogleAppsScript.Drive.Folder): GoogleAppsScript.Drive.Folder {
	return folder instanceof GasFolder ? folder.folder : folder;
}
