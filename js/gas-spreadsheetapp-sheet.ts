// gas:spreadsheet-app/gas-sheet@0.1.0-alpha
import {
	CellValue,
	ClearOptions,
	fromWitCellValue,
	GasRange,
	RangeSelector,
	toWitCellValue,
	unwrapRange,
} from "./gas-spreadsheetapp-range";

export function selectRangeOnSheet(
	sheet: GoogleAppsScript.Spreadsheet.Sheet,
	selector: RangeSelector
): GasRange {
	if (selector.tag === "a1-notation") {
		return new GasRange(sheet.getRange(selector.val));
	}
	const { row, column, numRows, numColumns } = selector.val;
	if (numRows !== undefined && numRows !== null && numColumns !== undefined && numColumns !== null) {
		return new GasRange(sheet.getRange(row, column, numRows, numColumns));
	}
	if (numRows !== undefined && numRows !== null) {
		return new GasRange(sheet.getRange(row, column, numRows));
	}
	return new GasRange(sheet.getRange(row, column));
}

export class GasSheet {
	public readonly sheet: GoogleAppsScript.Spreadsheet.Sheet;

	constructor(sheetObject: GoogleAppsScript.Spreadsheet.Sheet) {
		this.sheet = sheetObject;
	}

	activate(): GasSheet {
		return new GasSheet(this.sheet.activate());
	}

	appendRow(rowContents: CellValue[]): GasSheet {
		const rawRow = rowContents.map(fromWitCellValue);
		return new GasSheet(this.sheet.appendRow(rawRow));
	}

	autoResizeColumn(columnPosition: number): GasSheet {
		return new GasSheet(this.sheet.autoResizeColumn(columnPosition));
	}

	autoResizeColumns(startColumn: number, numColumns: number): GasSheet {
		return new GasSheet(this.sheet.autoResizeColumns(startColumn, numColumns));
	}

	clear(options?: ClearOptions): GasSheet {
		if (options !== undefined && options !== null) {
			const opts: { formatOnly?: boolean; contentsOnly?: boolean } = {};
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			return new GasSheet(this.sheet.clear(opts));
		}
		return new GasSheet(this.sheet.clear());
	}

	clearContents(): GasSheet {
		return new GasSheet(this.sheet.clearContents());
	}

	clearFormats(): GasSheet {
		return new GasSheet(this.sheet.clearFormats());
	}

	clearNotes(): GasSheet {
		return new GasSheet(this.sheet.clearNotes());
	}

	deleteColumn(columnPosition: number): GasSheet {
		return new GasSheet(this.sheet.deleteColumn(columnPosition));
	}

	deleteColumns(columnPosition: number, howMany: number): void {
		this.sheet.deleteColumns(columnPosition, howMany);
	}

	deleteRow(rowPosition: number): GasSheet {
		return new GasSheet(this.sheet.deleteRow(rowPosition));
	}

	deleteRows(rowPosition: number, howMany: number): void {
		this.sheet.deleteRows(rowPosition, howMany);
	}

	getActiveCell(): GasRange {
		return new GasRange(this.sheet.getActiveCell());
	}

	getActiveRange(): GasRange | undefined {
		const r = this.sheet.getActiveRange();
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getColumnWidth(columnPosition: number): number {
		return this.sheet.getColumnWidth(columnPosition);
	}

	getDataRange(): GasRange {
		return new GasRange(this.sheet.getDataRange());
	}

	getFrozenColumns(): number {
		return this.sheet.getFrozenColumns();
	}

	getFrozenRows(): number {
		return this.sheet.getFrozenRows();
	}

	getIndex(): number {
		return this.sheet.getIndex();
	}

	getLastColumn(): number {
		return this.sheet.getLastColumn();
	}

	getLastRow(): number {
		return this.sheet.getLastRow();
	}

	getMaxColumns(): number {
		return this.sheet.getMaxColumns();
	}

	getMaxRows(): number {
		return this.sheet.getMaxRows();
	}

	getName(): string {
		return this.sheet.getName();
	}

	getRange(selector: RangeSelector): GasRange {
		return selectRangeOnSheet(this.sheet, selector);
	}

	getRowHeight(rowPosition: number): number {
		return this.sheet.getRowHeight(rowPosition);
	}

	getSheetId(): number {
		return this.sheet.getSheetId();
	}

	getSheetName(): string {
		return this.sheet.getSheetName();
	}

	getSheetValues(startRow: number, startColumn: number, numRows: number, numColumns: number): CellValue[][] {
		return this.sheet
			.getSheetValues(startRow, startColumn, numRows, numColumns)
			.map((row) => row.map(toWitCellValue));
	}

	getTabColor(): string | undefined {
		const color = this.sheet.getTabColor();
		return color === null || color === undefined ? undefined : color;
	}

	hideColumn(column: GasRange): void {
		this.sheet.hideColumn(unwrapRange(column));
	}

	hideColumns(columnIndex: number, numColumns?: number): void {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.hideColumns(columnIndex, numColumns);
		} else {
			this.sheet.hideColumns(columnIndex);
		}
	}

	hideRow(row: GasRange): void {
		this.sheet.hideRow(unwrapRange(row));
	}

	hideRows(rowIndex: number, numRows?: number): void {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.hideRows(rowIndex, numRows);
		} else {
			this.sheet.hideRows(rowIndex);
		}
	}

	hideSheet(): GasSheet {
		return new GasSheet(this.sheet.hideSheet());
	}

	insertColumnAfter(afterPosition: number): GasSheet {
		return new GasSheet(this.sheet.insertColumnAfter(afterPosition));
	}

	insertColumnBefore(beforePosition: number): GasSheet {
		return new GasSheet(this.sheet.insertColumnBefore(beforePosition));
	}

	insertColumns(columnIndex: number, numColumns?: number): void {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.insertColumns(columnIndex, numColumns);
		} else {
			this.sheet.insertColumns(columnIndex);
		}
	}

	insertColumnsAfter(afterPosition: number, howMany: number): GasSheet {
		return new GasSheet(this.sheet.insertColumnsAfter(afterPosition, howMany));
	}

	insertColumnsBefore(beforePosition: number, howMany: number): GasSheet {
		return new GasSheet(this.sheet.insertColumnsBefore(beforePosition, howMany));
	}

	insertRowAfter(afterPosition: number): GasSheet {
		return new GasSheet(this.sheet.insertRowAfter(afterPosition));
	}

	insertRowBefore(beforePosition: number): GasSheet {
		return new GasSheet(this.sheet.insertRowBefore(beforePosition));
	}

	insertRows(rowIndex: number, numRows?: number): void {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.insertRows(rowIndex, numRows);
		} else {
			this.sheet.insertRows(rowIndex);
		}
	}

	insertRowsAfter(afterPosition: number, howMany: number): GasSheet {
		return new GasSheet(this.sheet.insertRowsAfter(afterPosition, howMany));
	}

	insertRowsBefore(beforePosition: number, howMany: number): GasSheet {
		return new GasSheet(this.sheet.insertRowsBefore(beforePosition, howMany));
	}

	isColumnHiddenByUser(columnPosition: number): boolean {
		return Boolean(this.sheet.isColumnHiddenByUser(columnPosition));
	}

	isRowHiddenByFilter(rowPosition: number): boolean {
		return Boolean(this.sheet.isRowHiddenByFilter(rowPosition));
	}

	isRowHiddenByUser(rowPosition: number): boolean {
		return Boolean(this.sheet.isRowHiddenByUser(rowPosition));
	}

	isSheetHidden(): boolean {
		return Boolean(this.sheet.isSheetHidden());
	}

	setActiveRange(range: GasRange): GasRange {
		return new GasRange(this.sheet.setActiveRange(unwrapRange(range)));
	}

	setActiveSelection(selector: RangeSelector): GasRange {
		if (selector.tag === "a1-notation") {
			return new GasRange(this.sheet.setActiveSelection(selector.val));
		}
		const r = selectRangeOnSheet(this.sheet, selector);
		return new GasRange(this.sheet.setActiveSelection(r.range));
	}

	setColumnWidth(columnPosition: number, width: number): GasSheet {
		return new GasSheet(this.sheet.setColumnWidth(columnPosition, width));
	}

	setColumnWidths(startColumn: number, numColumns: number, width: number): GasSheet {
		return new GasSheet(this.sheet.setColumnWidths(startColumn, numColumns, width));
	}

	setFrozenColumns(columns: number): void {
		this.sheet.setFrozenColumns(columns);
	}

	setFrozenRows(rows: number): void {
		this.sheet.setFrozenRows(rows);
	}

	setName(name: string): GasSheet {
		return new GasSheet(this.sheet.setName(name));
	}

	setRowHeight(rowPosition: number, height: number): GasSheet {
		return new GasSheet(this.sheet.setRowHeight(rowPosition, height));
	}

	setRowHeights(startRow: number, numRows: number, height: number): GasSheet {
		return new GasSheet(this.sheet.setRowHeights(startRow, numRows, height));
	}

	setTabColor(color?: string): GasSheet {
		return new GasSheet(this.sheet.setTabColor(color ?? null));
	}

	showColumns(columnIndex: number, numColumns?: number): void {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.showColumns(columnIndex, numColumns);
		} else {
			this.sheet.showColumns(columnIndex);
		}
	}

	showRows(rowIndex: number, numRows?: number): void {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.showRows(rowIndex, numRows);
		} else {
			this.sheet.showRows(rowIndex);
		}
	}

	showSheet(): GasSheet {
		return new GasSheet(this.sheet.showSheet());
	}

	sort(columnPosition: number, ascending?: boolean): GasSheet {
		if (ascending !== undefined && ascending !== null) {
			return new GasSheet(this.sheet.sort(columnPosition, Boolean(ascending)));
		}
		return new GasSheet(this.sheet.sort(columnPosition));
	}
}

export function unwrapSheet(sheet: GasSheet | GoogleAppsScript.Spreadsheet.Sheet): GoogleAppsScript.Spreadsheet.Sheet {
	return sheet instanceof GasSheet ? sheet.sheet : sheet;
}
