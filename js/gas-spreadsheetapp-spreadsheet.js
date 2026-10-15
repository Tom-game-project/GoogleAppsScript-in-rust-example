// gas:spreadsheet-app/gas-spreadsheet@0.1.0-alpha
import { GasRange, fromWitCellValue } from "./gas-spreadsheetapp-range";
import { GasSheet, selectRangeOnTarget } from "./gas-spreadsheetapp-sheet";

export class GasSpreadsheet {
	/**
	 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheetObject
	 */
	constructor(spreadsheetObject) {
		this.spreadsheet = spreadsheetObject;
	}

	appendRow(rowContents) {
		const rawRow = rowContents.map(fromWitCellValue);
		return new GasSheet(this.spreadsheet.appendRow(rawRow));
	}

	copy(name) {
		return new GasSpreadsheet(this.spreadsheet.copy(name));
	}

	deleteActiveSheet() {
		return new GasSheet(this.spreadsheet.deleteActiveSheet());
	}

	deleteColumn(columnPosition) {
		return new GasSheet(this.spreadsheet.deleteColumn(columnPosition));
	}

	deleteColumns(columnPosition, howMany) {
		this.spreadsheet.deleteColumns(columnPosition, howMany);
	}

	deleteRow(rowPosition) {
		return new GasSheet(this.spreadsheet.deleteRow(rowPosition));
	}

	deleteRows(rowPosition, howMany) {
		this.spreadsheet.deleteRows(rowPosition, howMany);
	}

	deleteSheet(sheet) {
		this.spreadsheet.deleteSheet(sheet.sheet ?? sheet);
	}

	duplicateActiveSheet() {
		return new GasSheet(this.spreadsheet.duplicateActiveSheet());
	}

	getActiveCell() {
		return new GasRange(this.spreadsheet.getActiveCell());
	}

	getActiveRange() {
		const r = this.spreadsheet.getActiveRange();
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getActiveSheet() {
		return new GasSheet(this.spreadsheet.getActiveSheet());
	}

	getId() {
		return this.spreadsheet.getId();
	}

	getLastColumn() {
		return this.spreadsheet.getLastColumn();
	}

	getLastRow() {
		return this.spreadsheet.getLastRow();
	}

	getName() {
		return this.spreadsheet.getName();
	}

	getNumSheets() {
		return this.spreadsheet.getNumSheets();
	}

	getRange(a1Notation) {
		return new GasRange(this.spreadsheet.getRange(a1Notation));
	}

	getRangeByName(name) {
		const r = this.spreadsheet.getRangeByName(name);
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getSheetById(id) {
		const s = this.spreadsheet.getSheetById(Number(id));
		if (s === null || s === undefined) {
			return undefined;
		}
		return new GasSheet(s);
	}

	getSheetByName(name) {
		const s = this.spreadsheet.getSheetByName(name);
		if (s === null || s === undefined) {
			return undefined;
		}
		return new GasSheet(s);
	}

	getSheetId() {
		return this.spreadsheet.getSheetId();
	}

	getSheetName() {
		return this.spreadsheet.getSheetName();
	}

	getSheets() {
		return this.spreadsheet.getSheets().map((s) => new GasSheet(s));
	}

	getSpreadsheetLocale() {
		return this.spreadsheet.getSpreadsheetLocale();
	}

	getSpreadsheetTimeZone() {
		return this.spreadsheet.getSpreadsheetTimeZone();
	}

	getUrl() {
		return this.spreadsheet.getUrl();
	}

	insertSheet(options) {
		if (options === undefined || options === null) {
			return new GasSheet(this.spreadsheet.insertSheet());
		}
		const name = options.sheetName ?? undefined;
		const index = options.sheetIndex ?? undefined;
		const template = options.template ? (options.template.sheet ?? options.template) : undefined;
		const extraOpts = template ? { template } : undefined;

		if (name !== undefined && index !== undefined && extraOpts !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(name, index, extraOpts));
		}
		if (name !== undefined && index !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(name, index));
		}
		if (name !== undefined && extraOpts !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(name, extraOpts));
		}
		if (index !== undefined && extraOpts !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(index, extraOpts));
		}
		if (name !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(name));
		}
		if (index !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(index));
		}
		if (extraOpts !== undefined) {
			return new GasSheet(this.spreadsheet.insertSheet(extraOpts));
		}
		return new GasSheet(this.spreadsheet.insertSheet());
	}

	moveActiveSheet(pos) {
		this.spreadsheet.moveActiveSheet(pos);
	}

	removeNamedRange(name) {
		this.spreadsheet.removeNamedRange(name);
	}

	rename(newName) {
		this.spreadsheet.rename(newName);
	}

	renameActiveSheet(newName) {
		this.spreadsheet.renameActiveSheet(newName);
	}

	setActiveRange(range) {
		return new GasRange(this.spreadsheet.setActiveRange(range.range ?? range));
	}

	setActiveSelection(selector) {
		if (selector.tag === "a1-notation") {
			return new GasRange(this.spreadsheet.setActiveSelection(selector.val));
		}
		const r = selectRangeOnTarget(this.spreadsheet.getActiveSheet(), selector);
		return new GasRange(this.spreadsheet.setActiveSelection(r.range));
	}

	setActiveSheet(sheet, restoreSelection) {
		const rawSheet = sheet.sheet ?? sheet;
		if (restoreSelection !== undefined && restoreSelection !== null) {
			return new GasSheet(this.spreadsheet.setActiveSheet(rawSheet, Boolean(restoreSelection)));
		}
		return new GasSheet(this.spreadsheet.setActiveSheet(rawSheet));
	}

	setNamedRange(name, range) {
		this.spreadsheet.setNamedRange(name, range.range ?? range);
	}

	setSpreadsheetLocale(locale) {
		this.spreadsheet.setSpreadsheetLocale(locale);
	}

	setSpreadsheetTimeZone(timezone) {
		this.spreadsheet.setSpreadsheetTimeZone(timezone);
	}

	toast(msg, title, timeoutSeconds) {
		if (title !== undefined && title !== null && timeoutSeconds !== undefined && timeoutSeconds !== null) {
			this.spreadsheet.toast(msg, title, timeoutSeconds);
		} else if (title !== undefined && title !== null) {
			this.spreadsheet.toast(msg, title);
		} else {
			this.spreadsheet.toast(msg);
		}
	}
};
