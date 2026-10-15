import { GasTextOutput } from "./gas-content-service-text-output";

export function createTextOutput(content: string): GasTextOutput {
	return new GasTextOutput(ContentService.createTextOutput(content));
}
