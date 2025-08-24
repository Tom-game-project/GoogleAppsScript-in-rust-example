import { Properties } from "./gas-property-properties";

export const getUserProperties = function ()
{
	const f = PropertiesService.getUserProperties()

	return new Properties(f);
}

export const getScriptProperties = function ()
{
	const f = PropertiesService.getScriptProperties()

	return new Properties(f);
}

export const getDocumentProperties = function ()
{
	const f = PropertiesService.getDocumentProperties();

	return new Properties(f);
}
