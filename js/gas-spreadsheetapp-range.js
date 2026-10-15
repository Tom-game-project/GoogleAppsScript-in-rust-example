// gas:spreadsheet-app/gas-range@0.1.0-alpha

export function toWitCellValue(cellValue) {
	if (cellValue === "" || cellValue === null || cellValue === undefined) {
		return { tag: "empty" };
	} else if (typeof cellValue === "string") {
		return { tag: "string-value", val: cellValue };
	} else if (typeof cellValue === "number") {
		return { tag: "number-value", val: cellValue };
	} else if (typeof cellValue === "boolean") {
		return { tag: "boolean-value", val: cellValue };
	} else if (cellValue instanceof Date) {
		return { tag: "date-value", val: BigInt(cellValue.getTime()) };
	} else {
		return { tag: "otherwise-value" };
	}
}

export function fromWitCellValue(cellValue) {
	if (cellValue === null || cellValue === undefined) {
		return "";
	}
	switch (cellValue.tag) {
		case "empty":
			return "";
		case "string-value":
		case "number-value":
		case "boolean-value":
			return cellValue.val;
		case "date-value":
			return new Date(Number(cellValue.val));
		case "otherwise-value":
		default:
			return "";
	}
}

export class GasRange {
	/**
	 * @param {GoogleAppsScript.Spreadsheet.Range} rangeObject
	 */
	constructor(rangeObject) {
		this.range = rangeObject;
	}

	activate() {
		return new GasRange(this.range.activate());
	}

	breakApart() {
		return new GasRange(this.range.breakApart());
	}

	canEdit() {
		return Boolean(this.range.canEdit());
	}

	check() {
		return new GasRange(this.range.check());
	}

	clear(options) {
		if (options !== undefined && options !== null) {
			const opts = {};
			if (options.commentsOnly !== undefined && options.commentsOnly !== null) opts.commentsOnly = Boolean(options.commentsOnly);
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			if (options.validationsOnly !== undefined && options.validationsOnly !== null) opts.validationsOnly = Boolean(options.validationsOnly);
			if (options.skipFilteredRows !== undefined && options.skipFilteredRows !== null) opts.skipFilteredRows = Boolean(options.skipFilteredRows);
			return new GasRange(this.range.clear(opts));
		}
		return new GasRange(this.range.clear());
	}

	clearContent() {
		return new GasRange(this.range.clearContent());
	}

	clearFormat() {
		return new GasRange(this.range.clearFormat());
	}

	clearNote() {
		return new GasRange(this.range.clearNote());
	}

	copyTo(destination, options) {
		const rawDest = destination.range ?? destination;
		if (options !== undefined && options !== null) {
			const opts = {};
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			if (options.transposed !== undefined && options.transposed !== null) opts.transposed = Boolean(options.transposed);
			this.range.copyTo(rawDest, opts);
		} else {
			this.range.copyTo(rawDest);
		}
	}

	getA1Notation() {
		return this.range.getA1Notation();
	}

	getBackground() {
		return this.range.getBackground();
	}

	getBackgrounds() {
		return this.range.getBackgrounds();
	}

	getCell(row, column) {
		return new GasRange(this.range.getCell(row, column));
	}

	getColumn() {
		return this.range.getColumn();
	}

	getDisplayValue() {
		return this.range.getDisplayValue();
	}

	getDisplayValues() {
		return this.range.getDisplayValues();
	}

	getFontColor() {
		return this.range.getFontColor();
	}

	getFontColors() {
		return this.range.getFontColors();
	}

	getFontFamily() {
		return this.range.getFontFamily();
	}

	getFontSize() {
		return this.range.getFontSize();
	}

	getFontStyle() {
		return this.range.getFontStyle();
	}

	getFontWeight() {
		return this.range.getFontWeight();
	}

	getFormula() {
		return this.range.getFormula();
	}

	getFormulas() {
		return this.range.getFormulas();
	}

	getHeight() {
		return this.range.getHeight();
	}

	getHorizontalAlignment() {
		return this.range.getHorizontalAlignment();
	}

	getLastColumn() {
		return this.range.getLastColumn();
	}

	getLastRow() {
		return this.range.getLastRow();
	}

	getNote() {
		return this.range.getNote();
	}

	getNotes() {
		return this.range.getNotes();
	}

	getNumColumns() {
		return this.range.getNumColumns();
	}

	getNumRows() {
		return this.range.getNumRows();
	}

	getNumberFormat() {
		return this.range.getNumberFormat();
	}

	getNumberFormats() {
		return this.range.getNumberFormats();
	}

	getRow() {
		return this.range.getRow();
	}

	getValue() {
		return toWitCellValue(this.range.getValue());
	}

	getValues() {
		return this.range.getValues().map((row) => row.map(toWitCellValue));
	}

	getVerticalAlignment() {
		return this.range.getVerticalAlignment();
	}

	getWidth() {
		return this.range.getWidth();
	}

	getWrap() {
		return Boolean(this.range.getWrap());
	}

	isBlank() {
		return Boolean(this.range.isBlank());
	}

	isChecked() {
		const val = this.range.isChecked();
		return val === null || val === undefined ? undefined : Boolean(val);
	}

	isPartOfMerge() {
		return Boolean(this.range.isPartOfMerge());
	}

	merge() {
		return new GasRange(this.range.merge());
	}

	mergeAcross() {
		return new GasRange(this.range.mergeAcross());
	}

	mergeVertically() {
		return new GasRange(this.range.mergeVertically());
	}

	moveTo(target) {
		this.range.moveTo(target.range ?? target);
	}

	offset(rowOffset, columnOffset, numRows, numColumns) {
		if (numRows !== undefined && numRows !== null && numColumns !== undefined && numColumns !== null) {
			return new GasRange(this.range.offset(rowOffset, columnOffset, numRows, numColumns));
		}
		if (numRows !== undefined && numRows !== null) {
			return new GasRange(this.range.offset(rowOffset, columnOffset, numRows));
		}
		return new GasRange(this.range.offset(rowOffset, columnOffset));
	}

	setBackground(color) {
		return new GasRange(this.range.setBackground(color ?? null));
	}

	setBackgrounds(colors) {
		const mapped = colors.map((row) => row.map((c) => c ?? null));
		return new GasRange(this.range.setBackgrounds(mapped));
	}

	setFontColor(color) {
		return new GasRange(this.range.setFontColor(color ?? null));
	}

	setFontColors(colors) {
		const mapped = colors.map((row) => row.map((c) => c ?? null));
		return new GasRange(this.range.setFontColors(mapped));
	}

	setFontFamily(fontFamily) {
		return new GasRange(this.range.setFontFamily(fontFamily ?? null));
	}

	setFontSize(size) {
		return new GasRange(this.range.setFontSize(size));
	}

	setFontStyle(fontStyle) {
		return new GasRange(this.range.setFontStyle(fontStyle ?? null));
	}

	setFontWeight(fontWeight) {
		return new GasRange(this.range.setFontWeight(fontWeight ?? null));
	}

	setFormula(formula) {
		return new GasRange(this.range.setFormula(formula));
	}

	setFormulas(formulas) {
		return new GasRange(this.range.setFormulas(formulas));
	}

	setHorizontalAlignment(alignment) {
		return new GasRange(this.range.setHorizontalAlignment(alignment ?? null));
	}

	setNote(note) {
		return new GasRange(this.range.setNote(note ?? null));
	}

	setNotes(notes) {
		return new GasRange(this.range.setNotes(notes));
	}

	setNumberFormat(numberFormat) {
		return new GasRange(this.range.setNumberFormat(numberFormat));
	}

	setNumberFormats(numberFormats) {
		return new GasRange(this.range.setNumberFormats(numberFormats));
	}

	setValue(value) {
		return new GasRange(this.range.setValue(fromWitCellValue(value)));
	}

	setValues(values) {
		const rawValues = values.map((row) => row.map(fromWitCellValue));
		return new GasRange(this.range.setValues(rawValues));
	}

	setVerticalAlignment(alignment) {
		return new GasRange(this.range.setVerticalAlignment(alignment ?? null));
	}

	setWrap(isWrapEnabled) {
		return new GasRange(this.range.setWrap(Boolean(isWrapEnabled)));
	}

	sort(sortSpecs) {
		const specs = sortSpecs.map((s) => ({
			column: s.column,
			ascending: Boolean(s.ascending),
		}));
		return new GasRange(this.range.sort(specs));
	}

	trimWhitespace() {
		return new GasRange(this.range.trimWhitespace());
	}

	uncheck() {
		return new GasRange(this.range.uncheck());
	}
};
