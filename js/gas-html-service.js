// gas:html-service/gas-html-service@0.1.0-alpha
import { GasHtmlOutput, GasHtmlTemplate } from "./gas-html-service-output";

export function createHtmlOutput(source) {
	if (source === undefined || source === null) {
		return new GasHtmlOutput(HtmlService.createHtmlOutput());
	}
	if (source.tag === "blob") {
		return new GasHtmlOutput(HtmlService.createHtmlOutput(source.val.blob ?? source.val));
	}
	return new GasHtmlOutput(HtmlService.createHtmlOutput(source.val));
};

export function createHtmlOutputFromFile(filename) {
	return new GasHtmlOutput(HtmlService.createHtmlOutputFromFile(filename));
};

export function createTemplate(source) {
	if (source.tag === "blob") {
		return new GasHtmlTemplate(HtmlService.createTemplate(source.val.blob ?? source.val));
	}
	return new GasHtmlTemplate(HtmlService.createTemplate(source.val));
};

export function createTemplateFromFile(filename) {
	return new GasHtmlTemplate(HtmlService.createTemplateFromFile(filename));
};

export function getUserAgent() {
	return HtmlService.getUserAgent();
};
