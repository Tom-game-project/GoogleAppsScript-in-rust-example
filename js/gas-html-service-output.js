// gas:html-service/gas-html-output@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

function fromWitSandboxMode(mode) {
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

function fromWitXFrameOptionsMode(mode) {
	switch (mode) {
		case "allowall":
			return HtmlService.XFrameOptionsMode.ALLOWALL;
		case "default-mode":
		default:
			return HtmlService.XFrameOptionsMode.DEFAULT;
	}
}

export class GasHtmlOutputMetaTag {
	constructor(metaTagObject) {
		this.metaTag = metaTagObject;
	}

	getContent() {
		return this.metaTag.getContent();
	}

	getName() {
		return this.metaTag.getName();
	}
};

export class GasHtmlOutput {
	constructor(htmlOutputObject) {
		this.htmlOutput = htmlOutputObject;
		this.rawHtmlOutput = htmlOutputObject;
	}

	getRawHtmlOutput() {
		return this.rawHtmlOutput;
	}

	addMetaTag(name, content) {
		this.htmlOutput.addMetaTag(name, content);
		return this;
	}

	append(addedContent) {
		this.htmlOutput.append(addedContent);
		return this;
	}

	appendUntrusted(addedContent) {
		this.htmlOutput.appendUntrusted(addedContent);
		return this;
	}

	asTemplate() {
		return new GasHtmlTemplate(this.htmlOutput.asTemplate());
	}

	clear() {
		this.htmlOutput.clear();
		return this;
	}

	getAs(contentType) {
		return new GasBlob(this.htmlOutput.getAs(contentType));
	}

	getBlob() {
		return new GasBlob(this.htmlOutput.getBlob());
	}

	getContent() {
		return this.htmlOutput.getContent();
	}

	getFaviconUrl() {
		const url = this.htmlOutput.getFaviconUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getHeight() {
		const h = this.htmlOutput.getHeight();
		return h === null || h === undefined ? undefined : h;
	}

	getMetaTags() {
		return this.htmlOutput.getMetaTags().map((m) => new GasHtmlOutputMetaTag(m));
	}

	getTitle() {
		return this.htmlOutput.getTitle();
	}

	getWidth() {
		const w = this.htmlOutput.getWidth();
		return w === null || w === undefined ? undefined : w;
	}

	setContent(content) {
		this.htmlOutput.setContent(content);
		return this;
	}

	setFaviconUrl(iconUrl) {
		this.htmlOutput.setFaviconUrl(iconUrl);
		return this;
	}

	setHeight(height) {
		this.htmlOutput.setHeight(height);
		return this;
	}

	setSandboxMode(mode) {
		this.htmlOutput.setSandboxMode(fromWitSandboxMode(mode));
		return this;
	}

	setTitle(title) {
		this.htmlOutput.setTitle(title);
		return this;
	}

	setWidth(width) {
		this.htmlOutput.setWidth(width);
		return this;
	}

	setXFrameOptionsMode(mode) {
		this.htmlOutput.setXFrameOptionsMode(fromWitXFrameOptionsMode(mode));
		return this;
	}
};

export class GasHtmlTemplate {
	constructor(templateObject) {
		this.template = templateObject;
	}

	evaluate() {
		return new GasHtmlOutput(this.template.evaluate());
	}

	getCode() {
		return this.template.getCode();
	}

	getCodeWithComments() {
		return this.template.getCodeWithComments();
	}

	getRawContent() {
		return this.template.getRawContent();
	}

	setProperty(key, value) {
		this.template[key] = value;
		return this;
	}

	setJsonProperties(jsonObject) {
		const parsed = JSON.parse(jsonObject);
		if (parsed && typeof parsed === "object") {
			Object.assign(this.template, parsed);
		}
		return this;
	}
};
