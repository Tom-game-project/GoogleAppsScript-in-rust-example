// gas:gmail-app/gas-gmail-app@0.1.0-alpha
import {
	GasGmailLabel,
	GasGmailMessage,
	GasGmailThread,
	GasGmailDraft,
	toGasGmailOptions,
} from "./gas-gmail-types";

export function createDraft(recipient, subject, body, options) {
	const opts = toGasGmailOptions(options);
	if (opts !== undefined) {
		return new GasGmailDraft(GmailApp.createDraft(recipient, subject, body, opts));
	}
	return new GasGmailDraft(GmailApp.createDraft(recipient, subject, body));
};

export function createLabel(name) {
	return new GasGmailLabel(GmailApp.createLabel(name));
};

export function deleteLabel(label) {
	GmailApp.deleteLabel(label.label ?? label);
};

export function getAliases() {
	return GmailApp.getAliases();
};

export function getDraft(draftId) {
	return new GasGmailDraft(GmailApp.getDraft(draftId));
};

export function getDraftMessages() {
	return GmailApp.getDraftMessages().map((m) => new GasGmailMessage(m));
};

export function getDrafts() {
	return GmailApp.getDrafts().map((d) => new GasGmailDraft(d));
};

export function getInboxThreads(start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getInboxThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getInboxThreads().map((t) => new GasGmailThread(t));
};

export function getInboxUnreadCount() {
	return GmailApp.getInboxUnreadCount();
};

export function getMessageById(id) {
	const m = GmailApp.getMessageById(id);
	return m === null || m === undefined ? undefined : new GasGmailMessage(m);
};

export function getPriorityInboxThreads(start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getPriorityInboxThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getPriorityInboxThreads().map((t) => new GasGmailThread(t));
};

export function getPriorityInboxUnreadCount() {
	return GmailApp.getPriorityInboxUnreadCount();
};

export function getSpamThreads(start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getSpamThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getSpamThreads().map((t) => new GasGmailThread(t));
};

export function getSpamUnreadCount() {
	return GmailApp.getSpamUnreadCount();
};

export function getStarredThreads(start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getStarredThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getStarredThreads().map((t) => new GasGmailThread(t));
};

export function getStarredUnreadCount() {
	return GmailApp.getStarredUnreadCount();
};

export function getThreadById(id) {
	const t = GmailApp.getThreadById(id);
	return t === null || t === undefined ? undefined : new GasGmailThread(t);
};

export function getTrashThreads(start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getTrashThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getTrashThreads().map((t) => new GasGmailThread(t));
};

export function getUserLabelByName(name) {
	const l = GmailApp.getUserLabelByName(name);
	return l === null || l === undefined ? undefined : new GasGmailLabel(l);
};

export function getUserLabels() {
	return GmailApp.getUserLabels().map((l) => new GasGmailLabel(l));
};

export function search(query, start, max) {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.search(query, start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.search(query).map((t) => new GasGmailThread(t));
};

export function sendEmail(recipient, subject, body, options) {
	const opts = toGasGmailOptions(options);
	if (opts !== undefined) {
		GmailApp.sendEmail(recipient, subject, body, opts);
	} else {
		GmailApp.sendEmail(recipient, subject, body);
	}
};
