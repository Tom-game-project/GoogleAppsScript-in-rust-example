// gas:gmail-app/gas-gmail-types@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export function toGasGmailOptions(options) {
	if (options === undefined || options === null) {
		return undefined;
	}
	const opts = {};
	if (options.attachments !== undefined && options.attachments !== null) {
		opts.attachments = options.attachments.map((b) => b.blob ?? b);
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
	constructor(labelObject) {
		this.label = labelObject;
	}

	deleteLabel() {
		this.label.deleteLabel();
	}

	getName() {
		return this.label.getName();
	}

	getThreads(start, max) {
		if (start !== undefined && start !== null && max !== undefined && max !== null) {
			return this.label.getThreads(start, max).map((t) => new GasGmailThread(t));
		}
		return this.label.getThreads().map((t) => new GasGmailThread(t));
	}

	getUnreadCount() {
		return this.label.getUnreadCount();
	}
};

export class GasGmailMessage {
	constructor(messageObject) {
		this.message = messageObject;
	}

	forward(recipient, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.forward(recipient, opts));
		}
		return new GasGmailMessage(this.message.forward(recipient));
	}

	getAttachments() {
		return this.message.getAttachments().map((a) => new GasBlob(a));
	}

	getBcc() {
		return this.message.getBcc();
	}

	getBody() {
		return this.message.getBody();
	}

	getCc() {
		return this.message.getCc();
	}

	getDate() {
		return BigInt(this.message.getDate().getTime());
	}

	getFrom() {
		return this.message.getFrom();
	}

	getHeader(name) {
		return this.message.getHeader(name);
	}

	getId() {
		return this.message.getId();
	}

	getPlainBody() {
		return this.message.getPlainBody();
	}

	getRawContent() {
		return this.message.getRawContent();
	}

	getReplyTo() {
		return this.message.getReplyTo();
	}

	getSubject() {
		return this.message.getSubject();
	}

	getThread() {
		return new GasGmailThread(this.message.getThread());
	}

	getTo() {
		return this.message.getTo();
	}

	isDraft() {
		return Boolean(this.message.isDraft());
	}

	isInChats() {
		return Boolean(this.message.isInChats());
	}

	isInInbox() {
		return Boolean(this.message.isInInbox());
	}

	isInSpam() {
		return Boolean(this.message.isInSpam());
	}

	isInTrash() {
		return Boolean(this.message.isInTrash());
	}

	isStarred() {
		return Boolean(this.message.isStarred());
	}

	isUnread() {
		return Boolean(this.message.isUnread());
	}

	markRead() {
		return new GasGmailMessage(this.message.markRead());
	}

	markUnread() {
		return new GasGmailMessage(this.message.markUnread());
	}

	moveToTrash() {
		return new GasGmailMessage(this.message.moveToTrash());
	}

	refresh() {
		return new GasGmailMessage(this.message.refresh());
	}

	reply(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.reply(body, opts));
		}
		return new GasGmailMessage(this.message.reply(body));
	}

	replyAll(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailMessage(this.message.replyAll(body, opts));
		}
		return new GasGmailMessage(this.message.replyAll(body));
	}

	star() {
		return new GasGmailMessage(this.message.star());
	}

	unstar() {
		return new GasGmailMessage(this.message.unstar());
	}
};

export class GasGmailThread {
	constructor(threadObject) {
		this.thread = threadObject;
	}

	addLabel(label) {
		return new GasGmailThread(this.thread.addLabel(label.label ?? label));
	}

	createDraftReply(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.thread.createDraftReply(body, opts));
		}
		return new GasGmailDraft(this.thread.createDraftReply(body));
	}

	createDraftReplyAll(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.thread.createDraftReplyAll(body, opts));
		}
		return new GasGmailDraft(this.thread.createDraftReplyAll(body));
	}

	getFirstMessageSubject() {
		return this.thread.getFirstMessageSubject();
	}

	getId() {
		return this.thread.getId();
	}

	getLabels() {
		return this.thread.getLabels().map((l) => new GasGmailLabel(l));
	}

	getLastMessageDate() {
		return BigInt(this.thread.getLastMessageDate().getTime());
	}

	getMessageCount() {
		return this.thread.getMessageCount();
	}

	getMessages() {
		return this.thread.getMessages().map((m) => new GasGmailMessage(m));
	}

	getPermalink() {
		return this.thread.getPermalink();
	}

	hasStarredMessages() {
		return Boolean(this.thread.hasStarredMessages());
	}

	isImportant() {
		return Boolean(this.thread.isImportant());
	}

	isInChats() {
		return Boolean(this.thread.isInChats());
	}

	isInInbox() {
		return Boolean(this.thread.isInInbox());
	}

	isInPriorityInbox() {
		return Boolean(this.thread.isInPriorityInbox());
	}

	isInSpam() {
		return Boolean(this.thread.isInSpam());
	}

	isInTrash() {
		return Boolean(this.thread.isInTrash());
	}

	isUnread() {
		return Boolean(this.thread.isUnread());
	}

	markImportant() {
		return new GasGmailThread(this.thread.markImportant());
	}

	markRead() {
		return new GasGmailThread(this.thread.markRead());
	}

	markUnimportant() {
		return new GasGmailThread(this.thread.markUnimportant());
	}

	markUnread() {
		return new GasGmailThread(this.thread.markUnread());
	}

	moveToArchive() {
		return new GasGmailThread(this.thread.moveToArchive());
	}

	moveToInbox() {
		return new GasGmailThread(this.thread.moveToInbox());
	}

	moveToSpam() {
		return new GasGmailThread(this.thread.moveToSpam());
	}

	moveToTrash() {
		return new GasGmailThread(this.thread.moveToTrash());
	}

	refresh() {
		return new GasGmailThread(this.thread.refresh());
	}

	removeLabel(label) {
		return new GasGmailThread(this.thread.removeLabel(label.label ?? label));
	}

	reply(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailThread(this.thread.reply(body, opts));
		}
		return new GasGmailThread(this.thread.reply(body));
	}

	replyAll(body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailThread(this.thread.replyAll(body, opts));
		}
		return new GasGmailThread(this.thread.replyAll(body));
	}
};

export class GasGmailDraft {
	constructor(draftObject) {
		this.draft = draftObject;
	}

	deleteDraft() {
		this.draft.deleteDraft();
	}

	getId() {
		return this.draft.getId();
	}

	getMessage() {
		return new GasGmailMessage(this.draft.getMessage());
	}

	getMessageId() {
		return this.draft.getMessageId();
	}

	send() {
		return new GasGmailMessage(this.draft.send());
	}

	update(recipient, subject, body, options) {
		const opts = toGasGmailOptions(options);
		if (opts !== undefined) {
			return new GasGmailDraft(this.draft.update(recipient, subject, body, opts));
		}
		return new GasGmailDraft(this.draft.update(recipient, subject, body));
	}
};
