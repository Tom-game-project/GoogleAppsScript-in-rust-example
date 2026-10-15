// gas:spreadsheet-app/gas-spreadsheet-app@0.1.0-alpha
import { GasRange } from "./gas-spreadsheetapp-range";
import { GasSheet } from "./gas-spreadsheetapp-sheet";
import { GasSpreadsheet } from "./gas-spreadsheetapp-spreadsheet";

export function create(name, rows, columns) {
	if (rows !== undefined && rows !== null && columns !== undefined && columns !== null) {
		return new GasSpreadsheet(SpreadsheetApp.create(name, rows, columns));
	}
	return new GasSpreadsheet(SpreadsheetApp.create(name));
};

export function flush() {
	SpreadsheetApp.flush();
};

export function getActive() {
	const s = SpreadsheetApp.getActive();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
};

export function getActiveRange() {
	const r = SpreadsheetApp.getActiveRange();
	if (r === null || r === undefined) {
		return undefined;
	}
	return new GasRange(r);
};

export function getActiveSheet() {
	const s = SpreadsheetApp.getActiveSheet();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSheet(s);
};

export function getActiveSpreadsheet() {
	const s = SpreadsheetApp.getActiveSpreadsheet();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
};

export function open(file) {
	const rawFile = file.file ?? file;
	const s = SpreadsheetApp.open(rawFile);
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
};

export function openById(id) {
	const s = SpreadsheetApp.openById(id);
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
};

export function openByUrl(url) {
	const s = SpreadsheetApp.openByUrl(url);
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
};

export function setActiveRange(range) {
	return new GasRange(SpreadsheetApp.setActiveRange(range.range ?? range));
};

export function setActiveSheet(sheet, restoreSelection) {
	const rawSheet = sheet.sheet ?? sheet;
	if (restoreSelection !== undefined && restoreSelection !== null) {
		return new GasSheet(SpreadsheetApp.setActiveSheet(rawSheet, Boolean(restoreSelection)));
	}
	return new GasSheet(SpreadsheetApp.setActiveSheet(rawSheet));
};

export function setActiveSpreadsheet(newActiveSpreadsheet) {
	SpreadsheetApp.setActiveSpreadsheet(newActiveSpreadsheet.spreadsheet ?? newActiveSpreadsheet);
};
