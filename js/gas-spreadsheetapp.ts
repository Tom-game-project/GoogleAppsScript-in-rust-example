// gas:spreadsheet-app/gas-spreadsheet-app@0.1.0-alpha
import { GasFile, unwrapFile } from "./gas-driveapp-file";
import { GasRange, unwrapRange } from "./gas-spreadsheetapp-range";
import { GasSheet, unwrapSheet } from "./gas-spreadsheetapp-sheet";
import { GasSpreadsheet, unwrapSpreadsheet } from "./gas-spreadsheetapp-spreadsheet";

export function create(name: string, rows?: number, columns?: number): GasSpreadsheet {
	if (rows !== undefined && rows !== null && columns !== undefined && columns !== null) {
		return new GasSpreadsheet(SpreadsheetApp.create(name, rows, columns));
	}
	return new GasSpreadsheet(SpreadsheetApp.create(name));
}

export function flush(): void {
	SpreadsheetApp.flush();
}

export function getActive(): GasSpreadsheet | undefined {
	const s = SpreadsheetApp.getActive();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
}

export function getActiveRange(): GasRange | undefined {
	const r = SpreadsheetApp.getActiveRange();
	if (r === null || r === undefined) {
		return undefined;
	}
	return new GasRange(r);
}

export function getActiveSheet(): GasSheet | undefined {
	const s = SpreadsheetApp.getActiveSheet();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSheet(s);
}

export function getActiveSpreadsheet(): GasSpreadsheet | undefined {
	const s = SpreadsheetApp.getActiveSpreadsheet();
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
}

export function open(file: GasFile): GasSpreadsheet | undefined {
	const s = SpreadsheetApp.open(unwrapFile(file));
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
}

export function openById(id: string): GasSpreadsheet | undefined {
	const s = SpreadsheetApp.openById(id);
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
}

export function openByUrl(url: string): GasSpreadsheet | undefined {
	const s = SpreadsheetApp.openByUrl(url);
	if (s === null || s === undefined) {
		return undefined;
	}
	return new GasSpreadsheet(s);
}

export function setActiveRange(range: GasRange): GasRange {
	return new GasRange(SpreadsheetApp.setActiveRange(unwrapRange(range)));
}

export function setActiveSheet(sheet: GasSheet, restoreSelection?: boolean): GasSheet {
	const rawSheet = unwrapSheet(sheet);
	if (restoreSelection !== undefined && restoreSelection !== null) {
		return new GasSheet(SpreadsheetApp.setActiveSheet(rawSheet, Boolean(restoreSelection)));
	}
	return new GasSheet(SpreadsheetApp.setActiveSheet(rawSheet));
}

export function setActiveSpreadsheet(newActiveSpreadsheet: GasSpreadsheet): void {
	SpreadsheetApp.setActiveSpreadsheet(unwrapSpreadsheet(newActiveSpreadsheet));
}
