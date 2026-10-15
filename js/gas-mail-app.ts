// gas:mail-app/gas-mail-app@0.1.0-alpha
import { GasBlob, unwrapBlob } from "./gas-driveapp-blob";

export interface MailAdvancedParameters {
	attachments?: GasBlob[];
	bcc?: string;
	cc?: string;
	htmlBody?: string;
	name?: string;
	noReply?: boolean;
	replyTo?: string;
}

export interface MailMessage {
	recipient: string;
	subject: string;
	body: string;
	options?: MailAdvancedParameters;
}

function toGasMailOptions(
	options?: MailAdvancedParameters
): GoogleAppsScript.Mail.MailAdvancedParameters | undefined {
	if (options === undefined || options === null) {
		return undefined;
	}
	const opts: GoogleAppsScript.Mail.MailAdvancedParameters = {};
	if (options.attachments !== undefined && options.attachments !== null) {
		opts.attachments = options.attachments.map(unwrapBlob);
	}
	if (options.bcc !== undefined && options.bcc !== null) opts.bcc = options.bcc;
	if (options.cc !== undefined && options.cc !== null) opts.cc = options.cc;
	if (options.htmlBody !== undefined && options.htmlBody !== null) opts.htmlBody = options.htmlBody;
	if (options.name !== undefined && options.name !== null) opts.name = options.name;
	if (options.noReply !== undefined && options.noReply !== null) opts.noReply = Boolean(options.noReply);
	if (options.replyTo !== undefined && options.replyTo !== null) opts.replyTo = options.replyTo;
	return opts;
}

export function getRemainingDailyQuota(): number {
	return MailApp.getRemainingDailyQuota();
}

export function sendEmail(message: MailMessage): void {
	const opts = toGasMailOptions(message.options);
	if (opts !== undefined) {
		MailApp.sendEmail(message.recipient, message.subject, message.body, opts);
	} else {
		MailApp.sendEmail(message.recipient, message.subject, message.body);
	}
}
