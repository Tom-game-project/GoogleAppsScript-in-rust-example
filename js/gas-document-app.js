// gas:document-app/gas-document-app@0.1.0-alpha
import { GasDocument } from "./gas-document-types";

export function create(name) {
	return new GasDocument(DocumentApp.create(name));
};

export function getActiveDocument() {
	const d = DocumentApp.getActiveDocument();
	return d === null || d === undefined ? undefined : new GasDocument(d);
};

export function openById(id) {
	const d = DocumentApp.openById(id);
	return d === null || d === undefined ? undefined : new GasDocument(d);
};

export function openByUrl(url) {
	const d = DocumentApp.openByUrl(url);
	return d === null || d === undefined ? undefined : new GasDocument(d);
};
