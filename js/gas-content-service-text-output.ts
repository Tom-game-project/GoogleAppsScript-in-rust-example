// gas:content-service/gas-text-output@0.1.0-alpha

export type MimeType =
	| "atom"
	| "csv"
	| "ical"
	| "javascript"
	| "json"
	| "rss"
	| "text"
	| "vcard"
	| "xml";

export class GasTextOutput {
	public readonly rawTextOutput: GoogleAppsScript.Content.TextOutput;

	constructor(textOutput: GoogleAppsScript.Content.TextOutput) {
		this.rawTextOutput = textOutput;
	}

	getRawTextOutput(): GoogleAppsScript.Content.TextOutput {
		return this.rawTextOutput;
	}

	append(addedContent: string): GasTextOutput {
		this.rawTextOutput.append(addedContent);
		return this;
	}

	clear(): GasTextOutput {
		this.rawTextOutput.clear();
		return this;
	}

	downloadAsFile(filename: string): GasTextOutput {
		this.rawTextOutput.downloadAsFile(filename);
		return this;
	}

	getContent(): string {
		return this.rawTextOutput.getContent();
	}

	getFileName(): string | undefined {
		const name = this.rawTextOutput.getFileName();
		return name === null || name === undefined ? undefined : name;
	}

	getMimeType(): MimeType {
		const raw = this.rawTextOutput.getMimeType();
		switch (raw) {
			case ContentService.MimeType.ATOM:
				return "atom";
			case ContentService.MimeType.CSV:
				return "csv";
			case ContentService.MimeType.ICAL:
				return "ical";
			case ContentService.MimeType.JAVASCRIPT:
				return "javascript";
			case ContentService.MimeType.JSON:
				return "json";
			case ContentService.MimeType.RSS:
				return "rss";
			case ContentService.MimeType.VCARD:
				return "vcard";
			case ContentService.MimeType.XML:
				return "xml";
			case ContentService.MimeType.TEXT:
			default:
				return "text";
		}
	}

	setContent(content: string): GasTextOutput {
		this.rawTextOutput.setContent(content);
		return this;
	}

	setMimeType(mime: MimeType): GasTextOutput {
		const map: Record<MimeType, GoogleAppsScript.Content.MimeType> = {
			atom: ContentService.MimeType.ATOM,
			csv: ContentService.MimeType.CSV,
			ical: ContentService.MimeType.ICAL,
			javascript: ContentService.MimeType.JAVASCRIPT,
			json: ContentService.MimeType.JSON,
			rss: ContentService.MimeType.RSS,
			text: ContentService.MimeType.TEXT,
			vcard: ContentService.MimeType.VCARD,
			xml: ContentService.MimeType.XML,
		};
		this.rawTextOutput.setMimeType(map[mime] ?? ContentService.MimeType.TEXT);
		return this;
	}
}
