// gas:html-service/gas-html-service@0.1.0-alpha
import { unwrapBlob } from "./gas-driveapp-blob";
import {
	GasHtmlOutput,
	GasHtmlTemplate,
	HtmlSource,
} from "./gas-html-service-output";

export function createHtmlOutput(source?: HtmlSource): GasHtmlOutput {
	if (source === undefined || source === null) {
		return new GasHtmlOutput(HtmlService.createHtmlOutput());
	}
	if (source.tag === "blob") {
		return new GasHtmlOutput(HtmlService.createHtmlOutput(unwrapBlob(source.val)));
	}
	return new GasHtmlOutput(HtmlService.createHtmlOutput(source.val));
}

export function createHtmlOutputFromFile(filename: string): GasHtmlOutput {
	return new GasHtmlOutput(HtmlService.createHtmlOutputFromFile(filename));
}

export function createTemplate(source: HtmlSource): GasHtmlTemplate {
	if (source.tag === "blob") {
		return new GasHtmlTemplate(HtmlService.createTemplate(unwrapBlob(source.val)));
	}
	return new GasHtmlTemplate(HtmlService.createTemplate(source.val));
}

export function createTemplateFromFile(filename: string): GasHtmlTemplate {
	return new GasHtmlTemplate(HtmlService.createTemplateFromFile(filename));
}

export function getUserAgent(): string {
	return HtmlService.getUserAgent();
}
