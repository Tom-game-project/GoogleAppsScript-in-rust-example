// gas:spreadsheet-app/gas-spreadsheet@0.1.0-alpha
import {
	CellValue,
	fromWitCellValue,
	GasRange,
	RangeSelector,
	unwrapRange,
} from "./gas-spreadsheetapp-range";
import { GasSheet, selectRangeOnSheet, unwrapSheet } from "./gas-spreadsheetapp-sheet";

export interface InsertSheetOptions {
	sheetName?: string;
	sheetIndex?: number;
	template?: GasSheet;
}

export class GasSpreadsheet {
	public readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;

	constructor(spreadsheetObject: GoogleAppsScript.Spreadsheet.Spreadsheet) {
		this.spreadsheet = spreadsheetObject;
	}

	appendRow(rowContents: CellValue[]): GasSheet {
		const rawRow = rowContents.map(fromWitCellValue);
		return new GasSheet(this.spreadsheet.appendRow(rawRow));
	}

	copy(name: string): GasSpreadsheet {
		return new GasSpreadsheet(this.spreadsheet.copy(name));
	}

	deleteActiveSheet(): GasSheet {
		return new GasSheet(this.spreadsheet.deleteActiveSheet());
	}

	deleteColumn(columnPosition: number): GasSheet {
		return new GasSheet(this.spreadsheet.deleteColumn(columnPosition));
	}

	deleteColumns(columnPosition: number, howMany: number): void {
		this.spreadsheet.deleteColumns(columnPosition, howMany);
	}

	deleteRow(rowPosition: number): GasSheet {
		return new GasSheet(this.spreadsheet.deleteRow(rowPosition));
	}

	deleteRows(rowPosition: number, howMany: number): void {
		this.spreadsheet.deleteRows(rowPosition, howMany);
	}

	deleteSheet(sheet: GasSheet): void {
		this.spreadsheet.deleteSheet(unwrapSheet(sheet));
	}

	duplicateActiveSheet(): GasSheet {
		return new GasSheet(this.spreadsheet.duplicateActiveSheet());
	}

	getActiveCell(): GasRange {
		return new GasRange(this.spreadsheet.getActiveCell());
	}

	getActiveRange(): GasRange | undefined {
		const r = this.spreadsheet.getActiveRange();
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getActiveSheet(): GasSheet {
		return new GasSheet(this.spreadsheet.getActiveSheet());
	}

	getId(): string {
		return this.spreadsheet.getId();
	}

	getLastColumn(): number {
		return this.spreadsheet.getLastColumn();
	}

	getLastRow(): number {
		return this.spreadsheet.getLastRow();
	}

	getName(): string {
		return this.spreadsheet.getName();
	}

	getNumSheets(): number {
		return this.spreadsheet.getNumSheets();
	}

	getRange(a1Notation: string): GasRange {
		return new GasRange(this.spreadsheet.getRange(a1Notation));
	}

	getRangeByName(name: string): GasRange | undefined {
		const r = this.spreadsheet.getRangeByName(name);
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getSheetById(id: number): GasSheet | undefined {
		const s = this.spreadsheet.getSheetById(Number(id));
		if (s === null || s === undefined) {
			return undefined;
		}
		return new GasSheet(s);
	}

	getSheetByName(name: string): GasSheet | undefined {
		const s = this.spreadsheet.getSheetByName(name);
		if (s === null || s === undefined) {
			return undefined;
		}
		return new GasSheet(s);
	}

	getSheetId(): number {
		return this.spreadsheet.getSheetId();
	}

	getSheetName(): string {
		return this.spreadsheet.getSheetName();
	}

	getSheets(): GasSheet[] {
		return this.spreadsheet.getSheets().map((s) => new GasSheet(s));
	}

	getSpreadsheetLocale(): string {
		return this.spreadsheet.getSpreadsheetLocale();
	}

	getSpreadsheetTimeZone(): string {
		return this.spreadsheet.getSpreadsheetTimeZone();
	}

	getUrl(): string {
		return this.spreadsheet.getUrl();
	}

	insertSheet(options?: InsertSheetOptions): GasSheet {
		if (options === undefined || options === null) {
			return new GasSheet(this.spreadsheet.insertSheet());
		}
		const name = options.sheetName ?? undefined;
		const index = options.sheetIndex ?? undefined;
		const template = options.template !== undefined && options.template !== null
			? unwrapSheet(options.template)
			: undefined;
		const extraOpts = template !== undefined ? { template } : undefined;

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

	moveActiveSheet(pos: number): void {
		this.spreadsheet.moveActiveSheet(pos);
	}

	removeNamedRange(name: string): void {
		this.spreadsheet.removeNamedRange(name);
	}

	rename(newName: string): void {
		this.spreadsheet.rename(newName);
	}

	renameActiveSheet(newName: string): void {
		this.spreadsheet.renameActiveSheet(newName);
	}

	setActiveRange(range: GasRange): GasRange {
		return new GasRange(this.spreadsheet.setActiveRange(unwrapRange(range)));
	}

	setActiveSelection(selector: RangeSelector): GasRange {
		if (selector.tag === "a1-notation") {
			return new GasRange(this.spreadsheet.setActiveSelection(selector.val));
		}
		const r = selectRangeOnSheet(this.spreadsheet.getActiveSheet(), selector);
		return new GasRange(this.spreadsheet.setActiveSelection(r.range));
	}

	setActiveSheet(sheet: GasSheet, restoreSelection?: boolean): GasSheet {
		const rawSheet = unwrapSheet(sheet);
		if (restoreSelection !== undefined && restoreSelection !== null) {
			return new GasSheet(this.spreadsheet.setActiveSheet(rawSheet, Boolean(restoreSelection)));
		}
		return new GasSheet(this.spreadsheet.setActiveSheet(rawSheet));
	}

	setNamedRange(name: string, range: GasRange): void {
		this.spreadsheet.setNamedRange(name, unwrapRange(range));
	}

	setSpreadsheetLocale(locale: string): void {
		this.spreadsheet.setSpreadsheetLocale(locale);
	}

	setSpreadsheetTimeZone(timezone: string): void {
		this.spreadsheet.setSpreadsheetTimeZone(timezone);
	}

	toast(msg: string, title?: string, timeoutSeconds?: number): void {
		if (title !== undefined && title !== null && timeoutSeconds !== undefined && timeoutSeconds !== null) {
			this.spreadsheet.toast(msg, title, timeoutSeconds);
		} else if (title !== undefined && title !== null) {
			this.spreadsheet.toast(msg, title);
		} else {
			this.spreadsheet.toast(msg);
		}
	}
}

export function unwrapSpreadsheet(
	spreadsheet: GasSpreadsheet | GoogleAppsScript.Spreadsheet.Spreadsheet
): GoogleAppsScript.Spreadsheet.Spreadsheet {
	return spreadsheet instanceof GasSpreadsheet ? spreadsheet.spreadsheet : spreadsheet;
}
