// gas:html-service/gas-html-output@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export type SandboxMode = "emulated" | "iframe" | "native";

export type XFrameOptionsMode = "allowall" | "default-mode";

export type HtmlSource =
	| { tag: "html"; val: string }
	| { tag: "blob"; val: GasBlob };

function fromWitSandboxMode(mode: SandboxMode): GoogleAppsScript.HTML.SandboxMode {
	switch (mode) {
		case "emulated":
			return HtmlService.SandboxMode.EMULATED;
		case "native":
			return HtmlService.SandboxMode.NATIVE;
		case "iframe":
		default:
			return HtmlService.SandboxMode.IFRAME;
	}
}

function fromWitXFrameOptionsMode(mode: XFrameOptionsMode): GoogleAppsScript.HTML.XFrameOptionsMode {
	switch (mode) {
		case "allowall":
			return HtmlService.XFrameOptionsMode.ALLOWALL;
		case "default-mode":
		default:
			return HtmlService.XFrameOptionsMode.DEFAULT;
	}
}

export class GasHtmlOutputMetaTag {
	public readonly metaTag: GoogleAppsScript.HTML.HtmlOutputMetaTag;

	constructor(metaTagObject: GoogleAppsScript.HTML.HtmlOutputMetaTag) {
		this.metaTag = metaTagObject;
	}

	getContent(): string {
		return this.metaTag.getContent();
	}

	getName(): string {
		return this.metaTag.getName();
	}
}

export class GasHtmlOutput {
	public readonly htmlOutput: GoogleAppsScript.HTML.HtmlOutput;
	public readonly rawHtmlOutput: GoogleAppsScript.HTML.HtmlOutput;

	constructor(htmlOutputObject: GoogleAppsScript.HTML.HtmlOutput) {
		this.htmlOutput = htmlOutputObject;
		this.rawHtmlOutput = htmlOutputObject;
	}

	getRawHtmlOutput(): GoogleAppsScript.HTML.HtmlOutput {
		return this.rawHtmlOutput;
	}

	addMetaTag(name: string, content: string): GasHtmlOutput {
		this.htmlOutput.addMetaTag(name, content);
		return this;
	}

	append(addedContent: string): GasHtmlOutput {
		this.htmlOutput.append(addedContent);
		return this;
	}

	appendUntrusted(addedContent: string): GasHtmlOutput {
		this.htmlOutput.appendUntrusted(addedContent);
		return this;
	}

	asTemplate(): GasHtmlTemplate {
		return new GasHtmlTemplate(this.htmlOutput.asTemplate());
	}

	clear(): GasHtmlOutput {
		this.htmlOutput.clear();
		return this;
	}

	getAs(contentType: string): GasBlob {
		return new GasBlob(this.htmlOutput.getAs(contentType));
	}

	getBlob(): GasBlob {
		return new GasBlob(this.htmlOutput.getBlob());
	}

	getContent(): string {
		return this.htmlOutput.getContent();
	}

	getFaviconUrl(): string | undefined {
		const url = this.htmlOutput.getFaviconUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getHeight(): number | undefined {
		const h = this.htmlOutput.getHeight();
		return h === null || h === undefined ? undefined : h;
	}

	getMetaTags(): GasHtmlOutputMetaTag[] {
		return this.htmlOutput.getMetaTags().map((m) => new GasHtmlOutputMetaTag(m));
	}

	getTitle(): string {
		return this.htmlOutput.getTitle();
	}

	getWidth(): number | undefined {
		const w = this.htmlOutput.getWidth();
		return w === null || w === undefined ? undefined : w;
	}

	setContent(content: string): GasHtmlOutput {
		this.htmlOutput.setContent(content);
		return this;
	}

	setFaviconUrl(iconUrl: string): GasHtmlOutput {
		this.htmlOutput.setFaviconUrl(iconUrl);
		return this;
	}

	setHeight(height: number): GasHtmlOutput {
		this.htmlOutput.setHeight(height);
		return this;
	}

	setSandboxMode(mode: SandboxMode): GasHtmlOutput {
		this.htmlOutput.setSandboxMode(fromWitSandboxMode(mode));
		return this;
	}

	setTitle(title: string): GasHtmlOutput {
		this.htmlOutput.setTitle(title);
		return this;
	}

	setWidth(width: number): GasHtmlOutput {
		this.htmlOutput.setWidth(width);
		return this;
	}

	setXFrameOptionsMode(mode: XFrameOptionsMode): GasHtmlOutput {
		this.htmlOutput.setXFrameOptionsMode(fromWitXFrameOptionsMode(mode));
		return this;
	}
}

export class GasHtmlTemplate {
	public readonly template: GoogleAppsScript.HTML.HtmlTemplate;

	constructor(templateObject: GoogleAppsScript.HTML.HtmlTemplate) {
		this.template = templateObject;
	}

	evaluate(): GasHtmlOutput {
		return new GasHtmlOutput(this.template.evaluate());
	}

	getCode(): string {
		return this.template.getCode();
	}

	getCodeWithComments(): string {
		return this.template.getCodeWithComments();
	}

	getRawContent(): string {
		return this.template.getRawContent();
	}

	setProperty(key: string, value: string): GasHtmlTemplate {
		this.template[key] = value;
		return this;
	}

	setJsonProperties(jsonObject: string): GasHtmlTemplate {
		const parsed: unknown = JSON.parse(jsonObject);
		if (parsed !== null && typeof parsed === "object") {
			Object.assign(this.template, parsed);
		}
		return this;
	}
}
