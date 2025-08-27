import { GasRange } from "./gas-spreadsheetapp-range";

export const GasSheet = class GasSheet 
{
	/**
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheetObject 
	 *
	 * @returns 
	 */
	constructor(sheetObject)
	{
		this.sheet = sheetObject;
	}

	/**
	 * @returns {GasRange}
	 */
	getDataRange()
	{
		const r = this.sheet.getDataRange();

		return new GasRange(r);
	}
};
