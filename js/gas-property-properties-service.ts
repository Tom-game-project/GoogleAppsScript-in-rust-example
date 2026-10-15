// gas:property/properties-service@0.1.0-alpha
import { Properties } from "./gas-property-properties";

export function getDocumentProperties(): Properties | undefined {
	const p = PropertiesService.getDocumentProperties();
	if (p === null || p === undefined) {
		return undefined;
	}
	return new Properties(p);
}

export function getScriptProperties(): Properties {
	const p = PropertiesService.getScriptProperties();
	return new Properties(p);
}

export function getUserProperties(): Properties {
	const p = PropertiesService.getUserProperties();
	return new Properties(p);
}
