// gas:spreadsheet-app/gas-sheet@0.1.0-alpha
import { GasRange, toWitCellValue, fromWitCellValue } from "./gas-spreadsheetapp-range";

export function selectRangeOnTarget(target, selector) {
	if (selector.tag === "a1-notation") {
		return new GasRange(target.getRange(selector.val));
	}
	const { row, column, numRows, numColumns } = selector.val;
	if (numRows !== undefined && numRows !== null && numColumns !== undefined && numColumns !== null) {
		return new GasRange(target.getRange(row, column, numRows, numColumns));
	}
	if (numRows !== undefined && numRows !== null) {
		return new GasRange(target.getRange(row, column, numRows));
	}
	return new GasRange(target.getRange(row, column));
}

export class GasSheet {
	/**
	 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheetObject
	 */
	constructor(sheetObject) {
		this.sheet = sheetObject;
	}

	activate() {
		return new GasSheet(this.sheet.activate());
	}

	appendRow(rowContents) {
		const rawRow = rowContents.map(fromWitCellValue);
		return new GasSheet(this.sheet.appendRow(rawRow));
	}

	autoResizeColumn(columnPosition) {
		return new GasSheet(this.sheet.autoResizeColumn(columnPosition));
	}

	autoResizeColumns(startColumn, numColumns) {
		return new GasSheet(this.sheet.autoResizeColumns(startColumn, numColumns));
	}

	clear(options) {
		if (options !== undefined && options !== null) {
			const opts = {};
			if (options.commentsOnly !== undefined && options.commentsOnly !== null) opts.commentsOnly = Boolean(options.commentsOnly);
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			if (options.validationsOnly !== undefined && options.validationsOnly !== null) opts.validationsOnly = Boolean(options.validationsOnly);
			if (options.skipFilteredRows !== undefined && options.skipFilteredRows !== null) opts.skipFilteredRows = Boolean(options.skipFilteredRows);
			return new GasSheet(this.sheet.clear(opts));
		}
		return new GasSheet(this.sheet.clear());
	}

	clearContents() {
		return new GasSheet(this.sheet.clearContents());
	}

	clearFormats() {
		return new GasSheet(this.sheet.clearFormats());
	}

	clearNotes() {
		return new GasSheet(this.sheet.clearNotes());
	}

	deleteColumn(columnPosition) {
		return new GasSheet(this.sheet.deleteColumn(columnPosition));
	}

	deleteColumns(columnPosition, howMany) {
		this.sheet.deleteColumns(columnPosition, howMany);
	}

	deleteRow(rowPosition) {
		return new GasSheet(this.sheet.deleteRow(rowPosition));
	}

	deleteRows(rowPosition, howMany) {
		this.sheet.deleteRows(rowPosition, howMany);
	}

	getActiveCell() {
		return new GasRange(this.sheet.getActiveCell());
	}

	getActiveRange() {
		const r = this.sheet.getActiveRange();
		return r === null || r === undefined ? undefined : new GasRange(r);
	}

	getColumnWidth(columnPosition) {
		return this.sheet.getColumnWidth(columnPosition);
	}

	getDataRange() {
		return new GasRange(this.sheet.getDataRange());
	}

	getFrozenColumns() {
		return this.sheet.getFrozenColumns();
	}

	getFrozenRows() {
		return this.sheet.getFrozenRows();
	}

	getIndex() {
		return this.sheet.getIndex();
	}

	getLastColumn() {
		return this.sheet.getLastColumn();
	}

	getLastRow() {
		return this.sheet.getLastRow();
	}

	getMaxColumns() {
		return this.sheet.getMaxColumns();
	}

	getMaxRows() {
		return this.sheet.getMaxRows();
	}

	getName() {
		return this.sheet.getName();
	}

	getRange(selector) {
		return selectRangeOnTarget(this.sheet, selector);
	}

	getRowHeight(rowPosition) {
		return this.sheet.getRowHeight(rowPosition);
	}

	getSheetId() {
		return this.sheet.getSheetId();
	}

	getSheetName() {
		return this.sheet.getSheetName();
	}

	getSheetValues(startRow, startColumn, numRows, numColumns) {
		return this.sheet
			.getSheetValues(startRow, startColumn, numRows, numColumns)
			.map((row) => row.map(toWitCellValue));
	}

	getTabColor() {
		const color = this.sheet.getTabColor();
		return color === null || color === undefined ? undefined : color;
	}

	hideColumn(column) {
		this.sheet.hideColumn(column.range ?? column);
	}

	hideColumns(columnIndex, numColumns) {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.hideColumns(columnIndex, numColumns);
		} else {
			this.sheet.hideColumns(columnIndex);
		}
	}

	hideRow(row) {
		this.sheet.hideRow(row.range ?? row);
	}

	hideRows(rowIndex, numRows) {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.hideRows(rowIndex, numRows);
		} else {
			this.sheet.hideRows(rowIndex);
		}
	}

	hideSheet() {
		return new GasSheet(this.sheet.hideSheet());
	}

	insertColumnAfter(afterPosition) {
		return new GasSheet(this.sheet.insertColumnAfter(afterPosition));
	}

	insertColumnBefore(beforePosition) {
		return new GasSheet(this.sheet.insertColumnBefore(beforePosition));
	}

	insertColumns(columnIndex, numColumns) {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.insertColumns(columnIndex, numColumns);
		} else {
			this.sheet.insertColumns(columnIndex);
		}
	}

	insertColumnsAfter(afterPosition, howMany) {
		return new GasSheet(this.sheet.insertColumnsAfter(afterPosition, howMany));
	}

	insertColumnsBefore(beforePosition, howMany) {
		return new GasSheet(this.sheet.insertColumnsBefore(beforePosition, howMany));
	}

	insertRowAfter(afterPosition) {
		return new GasSheet(this.sheet.insertRowAfter(afterPosition));
	}

	insertRowBefore(beforePosition) {
		return new GasSheet(this.sheet.insertRowBefore(beforePosition));
	}

	insertRows(rowIndex, numRows) {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.insertRows(rowIndex, numRows);
		} else {
			this.sheet.insertRows(rowIndex);
		}
	}

	insertRowsAfter(afterPosition, howMany) {
		return new GasSheet(this.sheet.insertRowsAfter(afterPosition, howMany));
	}

	insertRowsBefore(beforePosition, howMany) {
		return new GasSheet(this.sheet.insertRowsBefore(beforePosition, howMany));
	}

	isColumnHiddenByUser(columnPosition) {
		return Boolean(this.sheet.isColumnHiddenByUser(columnPosition));
	}

	isRowHiddenByFilter(rowPosition) {
		return Boolean(this.sheet.isRowHiddenByFilter(rowPosition));
	}

	isRowHiddenByUser(rowPosition) {
		return Boolean(this.sheet.isRowHiddenByUser(rowPosition));
	}

	isSheetHidden() {
		return Boolean(this.sheet.isSheetHidden());
	}

	setActiveRange(range) {
		return new GasRange(this.sheet.setActiveRange(range.range ?? range));
	}

	setActiveSelection(selector) {
		if (selector.tag === "a1-notation") {
			return new GasRange(this.sheet.setActiveSelection(selector.val));
		}
		const r = selectRangeOnTarget(this.sheet, selector);
		return new GasRange(this.sheet.setActiveSelection(r.range));
	}

	setColumnWidth(columnPosition, width) {
		return new GasSheet(this.sheet.setColumnWidth(columnPosition, width));
	}

	setColumnWidths(startColumn, numColumns, width) {
		return new GasSheet(this.sheet.setColumnWidths(startColumn, numColumns, width));
	}

	setFrozenColumns(columns) {
		this.sheet.setFrozenColumns(columns);
	}

	setFrozenRows(rows) {
		this.sheet.setFrozenRows(rows);
	}

	setName(name) {
		return new GasSheet(this.sheet.setName(name));
	}

	setRowHeight(rowPosition, height) {
		return new GasSheet(this.sheet.setRowHeight(rowPosition, height));
	}

	setRowHeights(startRow, numRows, height) {
		return new GasSheet(this.sheet.setRowHeights(startRow, numRows, height));
	}

	setTabColor(color) {
		return new GasSheet(this.sheet.setTabColor(color ?? null));
	}

	showColumns(columnIndex, numColumns) {
		if (numColumns !== undefined && numColumns !== null) {
			this.sheet.showColumns(columnIndex, numColumns);
		} else {
			this.sheet.showColumns(columnIndex);
		}
	}

	showRows(rowIndex, numRows) {
		if (numRows !== undefined && numRows !== null) {
			this.sheet.showRows(rowIndex, numRows);
		} else {
			this.sheet.showRows(rowIndex);
		}
	}

	showSheet() {
		return new GasSheet(this.sheet.showSheet());
	}

	sort(columnPosition, ascending) {
		if (ascending !== undefined && ascending !== null) {
			return new GasSheet(this.sheet.sort(columnPosition, Boolean(ascending)));
		}
		return new GasSheet(this.sheet.sort(columnPosition));
	}
};
