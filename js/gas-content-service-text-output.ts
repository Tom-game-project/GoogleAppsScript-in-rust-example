export type MimeType =
  | 'text'
  | 'csv'
  | 'ical'
  | 'javascript'
  | 'json'
  | 'rss'
  | 'vcard'
  | 'xml';

export class GasTextOutput {
    public readonly rawTextOutput: GoogleAppsScript.Content.TextOutput;
	constructor(text_output: GoogleAppsScript.Content.TextOutput) {
		this.rawTextOutput = text_output;
	}

    // 
    getRawTextOutput() {
        return this.rawTextOutput;
    }

	append(addedContent: string) {
		this.rawTextOutput.append(addedContent);
		return this;
	}

	clear() {
		this.rawTextOutput.clear();
		return this;
	}

    setMimeType(mime: MimeType) {
        const map = {
          text: ContentService.MimeType.TEXT,
          csv: ContentService.MimeType.CSV,
          ical: ContentService.MimeType.ICAL,
          javascript: ContentService.MimeType.JAVASCRIPT,
          json: ContentService.MimeType.JSON,
          rss: ContentService.MimeType.RSS,
          vcard: ContentService.MimeType.VCARD,
          xml: ContentService.MimeType.XML,
        };
        this.rawTextOutput.setMimeType(map[mime] || ContentService.MimeType.TEXT);
        return this;
    }

    downloadAsFile(filename: string) {
        this.rawTextOutput.downloadAsFile(filename);
        return this;
    }
};
