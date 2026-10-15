// gas:gmail-app/gas-gmail-app@0.1.0-alpha
import {
	GasGmailDraft,
	GasGmailLabel,
	GasGmailMessage,
	GasGmailThread,
	GmailAdvancedOptions,
	toGasGmailOptions,
	unwrapGmailLabel,
} from "./gas-gmail-types";

export function createDraft(
	recipient: string,
	subject: string,
	body: string,
	options?: GmailAdvancedOptions
): GasGmailDraft {
	const opts = toGasGmailOptions(options);
	if (opts !== undefined) {
		return new GasGmailDraft(GmailApp.createDraft(recipient, subject, body, opts));
	}
	return new GasGmailDraft(GmailApp.createDraft(recipient, subject, body));
}

export function createLabel(name: string): GasGmailLabel {
	return new GasGmailLabel(GmailApp.createLabel(name));
}

export function deleteLabel(label: GasGmailLabel): void {
	GmailApp.deleteLabel(unwrapGmailLabel(label));
}

export function getAliases(): string[] {
	return GmailApp.getAliases();
}

export function getDraft(draftId: string): GasGmailDraft {
	return new GasGmailDraft(GmailApp.getDraft(draftId));
}

export function getDraftMessages(): GasGmailMessage[] {
	return GmailApp.getDraftMessages().map((m) => new GasGmailMessage(m));
}

export function getDrafts(): GasGmailDraft[] {
	return GmailApp.getDrafts().map((d) => new GasGmailDraft(d));
}

export function getInboxThreads(start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getInboxThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getInboxThreads().map((t) => new GasGmailThread(t));
}

export function getInboxUnreadCount(): number {
	return GmailApp.getInboxUnreadCount();
}

export function getMessageById(id: string): GasGmailMessage | undefined {
	const m = GmailApp.getMessageById(id);
	return m === null || m === undefined ? undefined : new GasGmailMessage(m);
}

export function getPriorityInboxThreads(start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getPriorityInboxThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getPriorityInboxThreads().map((t) => new GasGmailThread(t));
}

export function getPriorityInboxUnreadCount(): number {
	return GmailApp.getPriorityInboxUnreadCount();
}

export function getSpamThreads(start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getSpamThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getSpamThreads().map((t) => new GasGmailThread(t));
}

export function getSpamUnreadCount(): number {
	return GmailApp.getSpamUnreadCount();
}

export function getStarredThreads(start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getStarredThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getStarredThreads().map((t) => new GasGmailThread(t));
}

export function getStarredUnreadCount(): number {
	return GmailApp.getStarredUnreadCount();
}

export function getThreadById(id: string): GasGmailThread | undefined {
	const t = GmailApp.getThreadById(id);
	return t === null || t === undefined ? undefined : new GasGmailThread(t);
}

export function getTrashThreads(start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.getTrashThreads(start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.getTrashThreads().map((t) => new GasGmailThread(t));
}

export function getUserLabelByName(name: string): GasGmailLabel | undefined {
	const l = GmailApp.getUserLabelByName(name);
	return l === null || l === undefined ? undefined : new GasGmailLabel(l);
}

export function getUserLabels(): GasGmailLabel[] {
	return GmailApp.getUserLabels().map((l) => new GasGmailLabel(l));
}

export function search(query: string, start?: number, max?: number): GasGmailThread[] {
	if (start !== undefined && start !== null && max !== undefined && max !== null) {
		return GmailApp.search(query, start, max).map((t) => new GasGmailThread(t));
	}
	return GmailApp.search(query).map((t) => new GasGmailThread(t));
}

export function sendEmail(
	recipient: string,
	subject: string,
	body: string,
	options?: GmailAdvancedOptions
): void {
	const opts = toGasGmailOptions(options);
	if (opts !== undefined) {
		GmailApp.sendEmail(recipient, subject, body, opts);
	} else {
		GmailApp.sendEmail(recipient, subject, body);
	}
}
