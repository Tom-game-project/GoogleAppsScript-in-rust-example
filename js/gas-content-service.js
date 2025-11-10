import { GasTextOutput } from "./gas-content-service-text-output";

export const createTextOutput = function (content) {
	let r = ContentService.createTextOutput(content);

	return new GasTextOutput(r);
}
