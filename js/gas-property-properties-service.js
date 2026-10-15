// gas:property/properties-service@0.1.0-alpha
import { Properties } from "./gas-property-properties";

export function getDocumentProperties() {
	const p = PropertiesService.getDocumentProperties();
	if (p === null || p === undefined) {
		return undefined;
	}
	return new Properties(p);
};

export function getScriptProperties() {
	const p = PropertiesService.getScriptProperties();
	return new Properties(p);
};

export function getUserProperties() {
	const p = PropertiesService.getUserProperties();
	return new Properties(p);
};
