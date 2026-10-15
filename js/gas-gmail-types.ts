// gas:gmail-app/gas-gmail-types@0.1.0-alpha
import { GasBlob, unwrapBlob } from "./gas-driveapp-blob";

export interface GmailAdvancedOptions {
	attachments?: GasBlob[];
	bcc?: string;
	cc?: string;
	fromAddress?: string;
	htmlBody?: string;
	name?: string;
	noReply?: boolean;
	replyTo?: string;
}

export function toGasGmailOptions(
	options?: GmailAdvancedOptions
): GoogleAppsScript.Gmail.GmailAdvancedOptions | undefined {
	if (options === undefined || options === null) {
		return undefined;
	}
	const opts: GoogleAppsScript.Gmail.GmailAdvancedOptions = {};
	if (options.attachments !== undefined && options.attachments !== null) {
		opts.attachments = options.attachments.map(unwrapBlob);
	}
	if (options.bcc !== undefined && options.bcc !== null) opts.bcc = options.bcc;
	if (options.cc !== undefined && options.cc !== null) opts.cc = options.cc;
	if (options.fromAddress !== undefined && options.fromAddress !== null) opts.from = options.fromAddress;
	if (options.htmlBody !== undefined && options.htmlBody !== null) opts.htmlBody = options.htmlBody;
	if (options.name !== undefined && options.name !== null) opts.name = options.name;
	if (options.noReply !== undefined && options.noReply !== null) opts.noReply = Boolean(options.noReply);
	if (options.replyTo !== undefined && options.replyTo !== null) opts.replyTo = options.replyTo;
	return opts;
}

export class GasGmailLabel {
	public readonly label: GoogleAppsScript.Gmail.GmailLabel;

	constructor(labelObject: GoogleAppsScript.Gmail.GmailLabel) {
		this.label = labelObject;
	}

	deleteLabel(): void {
		this.label.deleteLabel();
	}

	getName(): string {
		return this.label.getName();
	}

	getThreads(start?: number, max?: number): GasGmailThread[] {
		if (start !== undefined && start !== null && max !== undefined && max !== null) {
			return this.label.getThreads(start, max).map((t) => new GasGmailThread(t));
		}
		return this.label.getThreads().map((t) => new GasGmailThread(t));
	}

	getUnreadCount(): number {
		return this.label.getUnreadCount();
	}
}

export class GasGmailMessage {
	public readonly message: GoogleAppsScript.Gmail.GmailMessage;

	constructor(messageObject: GoogleAppsScript.Gmail.GmailMessage) {
		this.message = messageObject;
	}

	forward(recipient: string, options?: GmailAdvancedOptions): GasGmailMessage {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.forward(recipient, opts));
		}
		return new GasGmailMessage(this.message.forward(recipient));
	}

	getAttachments(): GasBlob[] {
		return this.message.getAttachments().map((a) => new GasBlob(a.copyBlob()));
	}

	getBcc(): string {
		return this.message.getBcc();
	}

	getBody(): string {
		return this.message.getBody();
	}

	getCc(): string {
		return this.message.getCc();
	}

	getDate(): bigint {
		return BigInt(this.message.getDate().getTime());
	}

	getFrom(): string {
		return this.message.getFrom();
	}

	getHeader(name: string): string {
		return this.message.getHeader(name);
	}

	getId(): string {
		return this.message.getId();
	}

	getPlainBody(): string {
		return this.message.getPlainBody();
	}

	getRawContent(): string {
		return this.message.getRawContent();
	}

	getReplyTo(): string {
		return this.message.getReplyTo();
	}

	getSubject(): string {
		return this.message.getSubject();
	}

	getThread(): GasGmailThread {
		return new GasGmailThread(this.message.getThread());
	}

	getTo(): string {
		return this.message.getTo();
	}

	isDraft(): boolean {
		return Boolean(this.message.isDraft());
	}

	isInChats(): boolean {
		return Boolean(this.message.isInChats());
	}

	isInInbox(): boolean {
		return Boolean(this.message.isInInbox());
	}

	isInSpam(): boolean {
		return Boolean(this.message.getThread().isInSpam());
	}

	isInTrash(): boolean {
		return Boolean(this.message.isInTrash());
	}

	isStarred(): boolean {
		return Boolean(this.message.isStarred());
	}

	isUnread(): boolean {
		return Boolean(this.message.isUnread());
	}

	markRead(): GasGmailMessage {
		return new GasGmailMessage(this.message.markRead());
	}

	markUnread(): GasGmailMessage {
		return new GasGmailMessage(this.message.markUnread());
	}

	moveToTrash(): GasGmailMessage {
		return new GasGmailMessage(this.message.moveToTrash());
	}

	refresh(): GasGmailMessage {
		return new GasGmailMessage(this.message.refresh());
	}

	reply(body: string, options?: GmailAdvancedOptions): GasGmailMessage {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.reply(body, opts));
		}
		return new GasGmailMessage(this.message.reply(body));
	}

	replyAll(body: string, options?: GmailAdvancedOptions): GasGmailMessage {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.replyAll(body, opts));
		}
		return new GasGmailMessage(this.message.replyAll(body));
	}

	star(): GasGmailMessage {
		return new GasGmailMessage(this.message.star());
	}

	unstar(): GasGmailMessage {
		return new GasGmailMessage(this.message.unstar());
	}
}

export class GasGmailThread {
	public readonly thread: GoogleAppsScript.Gmail.GmailThread;

	constructor(threadObject: GoogleAppsScript.Gmail.GmailThread) {
		this.thread = threadObject;
	}

	addLabel(label: GasGmailLabel): GasGmailThread {
		return new GasGmailThread(this.thread.addLabel(unwrapGmailLabel(label)));
	}

	createDraftReply(body: string, options?: GmailAdvancedOptions): GasGmailDraft {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.thread.createDraftReply(body, opts));
		}
		return new GasGmailDraft(this.thread.createDraftReply(body));
	}

	createDraftReplyAll(body: string, options?: GmailAdvancedOptions): GasGmailDraft {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.thread.createDraftReplyAll(body, opts));
		}
		return new GasGmailDraft(this.thread.createDraftReplyAll(body));
	}

	getFirstMessageSubject(): string {
		return this.thread.getFirstMessageSubject();
	}

	getId(): string {
		return this.thread.getId();
	}

	getLabels(): GasGmailLabel[] {
		return this.thread.getLabels().map((l) => new GasGmailLabel(l));
	}

	getLastMessageDate(): bigint {
		return BigInt(this.thread.getLastMessageDate().getTime());
	}

	getMessageCount(): number {
		return this.thread.getMessageCount();
	}

	getMessages(): GasGmailMessage[] {
		return this.thread.getMessages().map((m) => new GasGmailMessage(m));
	}

	getPermalink(): string {
		return this.thread.getPermalink();
	}

	hasStarredMessages(): boolean {
		return Boolean(this.thread.hasStarredMessages());
	}

	isImportant(): boolean {
		return Boolean(this.thread.isImportant());
	}

	isInChats(): boolean {
		return Boolean(this.thread.isInChats());
	}

	isInInbox(): boolean {
		return Boolean(this.thread.isInInbox());
	}

	isInPriorityInbox(): boolean {
		return Boolean(this.thread.isInPriorityInbox());
	}

	isInSpam(): boolean {
		return Boolean(this.thread.isInSpam());
	}

	isInTrash(): boolean {
		return Boolean(this.thread.isInTrash());
	}

	isUnread(): boolean {
		return Boolean(this.thread.isUnread());
	}

	markImportant(): GasGmailThread {
		return new GasGmailThread(this.thread.markImportant());
	}

	markRead(): GasGmailThread {
		return new GasGmailThread(this.thread.markRead());
	}

	markUnimportant(): GasGmailThread {
		return new GasGmailThread(this.thread.markUnimportant());
	}

	markUnread(): GasGmailThread {
		return new GasGmailThread(this.thread.markUnread());
	}

	moveToArchive(): GasGmailThread {
		return new GasGmailThread(this.thread.moveToArchive());
	}

	moveToInbox(): GasGmailThread {
		return new GasGmailThread(this.thread.moveToInbox());
	}

	moveToSpam(): GasGmailThread {
		return new GasGmailThread(this.thread.moveToSpam());
	}

	moveToTrash(): GasGmailThread {
		return new GasGmailThread(this.thread.moveToTrash());
	}

	refresh(): GasGmailThread {
		return new GasGmailThread(this.thread.refresh());
	}

	removeLabel(label: GasGmailLabel): GasGmailThread {
		return new GasGmailThread(this.thread.removeLabel(unwrapGmailLabel(label)));
	}

	reply(body: string, options?: GmailAdvancedOptions): GasGmailThread {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailThread(this.thread.reply(body, opts));
		}
		return new GasGmailThread(this.thread.reply(body));
	}

	replyAll(body: string, options?: GmailAdvancedOptions): GasGmailThread {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailThread(this.thread.replyAll(body, opts));
		}
		return new GasGmailThread(this.thread.replyAll(body));
	}
}

export class GasGmailDraft {
	public readonly draft: GoogleAppsScript.Gmail.GmailDraft;

	constructor(draftObject: GoogleAppsScript.Gmail.GmailDraft) {
		this.draft = draftObject;
	}

	deleteDraft(): void {
		this.draft.deleteDraft();
	}

	getId(): string {
		return this.draft.getId();
	}

	getMessage(): GasGmailMessage {
		return new GasGmailMessage(this.draft.getMessage());
	}

	getMessageId(): string {
		return this.draft.getMessageId();
	}

	send(): GasGmailMessage {
		return new GasGmailMessage(this.draft.send());
	}

	update(recipient: string, subject: string, body: string, options?: GmailAdvancedOptions): GasGmailDraft {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.draft.update(recipient, subject, body, opts));
		}
		return new GasGmailDraft(this.draft.update(recipient, subject, body));
	}
}

export function unwrapGmailLabel(
	label: GasGmailLabel | GoogleAppsScript.Gmail.GmailLabel
): GoogleAppsScript.Gmail.GmailLabel {
	return label instanceof GasGmailLabel ? label.label : label;
}
