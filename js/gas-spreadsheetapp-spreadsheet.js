import { GasSheet } from "./gas-spreadsheetapp-sheet";

export const GasSpreadsheet = class GasSpreadsheet {
	/**
	* @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
	* @returns 
	*/
	constructor (spreadsheetObject) {
		this.spreadsheet = spreadsheetObject;
	}

	/**
	 * @returns {string}
	 */
	getId()
	{
		return this.spreadsheet.getId();
	}

	/**
	* @param {string} id 
	* @returns {GasSheet}
	*/
	getSheetById(id)
	{
		const s = this.spreadsheet.getSheetById(id);

		if (s === null)
		{
			return null;
		}
		return new GasSheet(s);
	}

	/**
	* @param {string} name
	* @returns {GasSheet}
	*/
	getSheetByName(name)
	{
		const s = this.spreadsheet.getSheetByName(name);

		if (s === null)
		{
			return null;
		}
		return new GasSheet(s);
	}
};
