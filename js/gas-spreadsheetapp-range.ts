// gas:spreadsheet-app/gas-range@0.1.0-alpha

export type CellValue =
	| { tag: "empty" }
	| { tag: "string-value"; val: string }
	| { tag: "number-value"; val: number }
	| { tag: "boolean-value"; val: boolean }
	| { tag: "date-value"; val: bigint }
	| { tag: "otherwise-value" };

export interface ClearOptions {
	commentsOnly?: boolean;
	contentsOnly?: boolean;
	formatOnly?: boolean;
	validationsOnly?: boolean;
	skipFilteredRows?: boolean;
}

export interface CopyToOptions {
	contentsOnly?: boolean;
	formatOnly?: boolean;
	transposed?: boolean;
}

export interface SortSpec {
	column: number;
	ascending: boolean;
}

export interface GridRangeSelector {
	row: number;
	column: number;
	numRows?: number;
	numColumns?: number;
}

export type RangeSelector =
	| { tag: "a1-notation"; val: string }
	| { tag: "grid"; val: GridRangeSelector };

type GasFontStyle = Parameters<GoogleAppsScript.Spreadsheet.Range["setFontStyle"]>[0];
type GasFontWeight = Parameters<GoogleAppsScript.Spreadsheet.Range["setFontWeight"]>[0];
type GasHorizontalAlignment = Parameters<GoogleAppsScript.Spreadsheet.Range["setHorizontalAlignment"]>[0];
type GasVerticalAlignment = Parameters<GoogleAppsScript.Spreadsheet.Range["setVerticalAlignment"]>[0];

export function toWitCellValue(cellValue: unknown): CellValue {
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

export function fromWitCellValue(cellValue: CellValue | null | undefined): string | number | boolean | Date {
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
	public readonly range: GoogleAppsScript.Spreadsheet.Range;

	constructor(rangeObject: GoogleAppsScript.Spreadsheet.Range) {
		this.range = rangeObject;
	}

	activate(): GasRange {
		return new GasRange(this.range.activate());
	}

	breakApart(): GasRange {
		return new GasRange(this.range.breakApart());
	}

	canEdit(): boolean {
		return Boolean(this.range.canEdit());
	}

	check(): GasRange {
		return new GasRange(this.range.check());
	}

	clear(options?: ClearOptions): GasRange {
		if (options !== undefined && options !== null) {
			const opts: ClearOptions = {};
			if (options.commentsOnly !== undefined && options.commentsOnly !== null) opts.commentsOnly = Boolean(options.commentsOnly);
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			if (options.validationsOnly !== undefined && options.validationsOnly !== null) opts.validationsOnly = Boolean(options.validationsOnly);
			if (options.skipFilteredRows !== undefined && options.skipFilteredRows !== null) opts.skipFilteredRows = Boolean(options.skipFilteredRows);
			return new GasRange(this.range.clear(opts));
		}
		return new GasRange(this.range.clear());
	}

	clearContent(): GasRange {
		return new GasRange(this.range.clearContent());
	}

	clearFormat(): GasRange {
		return new GasRange(this.range.clearFormat());
	}

	clearNote(): GasRange {
		return new GasRange(this.range.clearNote());
	}

	copyTo(destination: GasRange, options?: CopyToOptions): void {
		const rawDest = unwrapRange(destination);
		if (options !== undefined && options !== null) {
			const opts: { formatOnly?: boolean; contentsOnly?: boolean } = {};
			if (options.contentsOnly !== undefined && options.contentsOnly !== null) opts.contentsOnly = Boolean(options.contentsOnly);
			if (options.formatOnly !== undefined && options.formatOnly !== null) opts.formatOnly = Boolean(options.formatOnly);
			this.range.copyTo(rawDest, opts);
		} else {
			this.range.copyTo(rawDest);
		}
	}

	getA1Notation(): string {
		return this.range.getA1Notation();
	}

	getBackground(): string {
		return this.range.getBackground();
	}

	getBackgrounds(): string[][] {
		return this.range.getBackgrounds();
	}

	getCell(row: number, column: number): GasRange {
		return new GasRange(this.range.getCell(row, column));
	}

	getColumn(): number {
		return this.range.getColumn();
	}

	getDisplayValue(): string {
		return this.range.getDisplayValue();
	}

	getDisplayValues(): string[][] {
		return this.range.getDisplayValues();
	}

	getFontColor(): string {
		return this.range.getFontColor();
	}

	getFontColors(): string[][] {
		return this.range.getFontColors();
	}

	getFontFamily(): string {
		return this.range.getFontFamily();
	}

	getFontSize(): number {
		return this.range.getFontSize();
	}

	getFontStyle(): string {
		return this.range.getFontStyle();
	}

	getFontWeight(): string {
		return this.range.getFontWeight();
	}

	getFormula(): string {
		return this.range.getFormula();
	}

	getFormulas(): string[][] {
		return this.range.getFormulas();
	}

	getHeight(): number {
		return this.range.getHeight();
	}

	getHorizontalAlignment(): string {
		return this.range.getHorizontalAlignment();
	}

	getLastColumn(): number {
		return this.range.getLastColumn();
	}

	getLastRow(): number {
		return this.range.getLastRow();
	}

	getNote(): string {
		return this.range.getNote();
	}

	getNotes(): string[][] {
		return this.range.getNotes();
	}

	getNumColumns(): number {
		return this.range.getNumColumns();
	}

	getNumRows(): number {
		return this.range.getNumRows();
	}

	getNumberFormat(): string {
		return this.range.getNumberFormat();
	}

	getNumberFormats(): string[][] {
		return this.range.getNumberFormats();
	}

	getRow(): number {
		return this.range.getRow();
	}

	getValue(): CellValue {
		return toWitCellValue(this.range.getValue());
	}

	getValues(): CellValue[][] {
		return this.range.getValues().map((row) => row.map(toWitCellValue));
	}

	getVerticalAlignment(): string {
		return this.range.getVerticalAlignment();
	}

	getWidth(): number {
		return this.range.getWidth();
	}

	getWrap(): boolean {
		return Boolean(this.range.getWrap());
	}

	isBlank(): boolean {
		return Boolean(this.range.isBlank());
	}

	isChecked(): boolean | undefined {
		const val = this.range.isChecked();
		return val === null || val === undefined ? undefined : Boolean(val);
	}

	isPartOfMerge(): boolean {
		return Boolean(this.range.isPartOfMerge());
	}

	merge(): GasRange {
		return new GasRange(this.range.merge());
	}

	mergeAcross(): GasRange {
		return new GasRange(this.range.mergeAcross());
	}

	mergeVertically(): GasRange {
		return new GasRange(this.range.mergeVertically());
	}

	moveTo(target: GasRange): void {
		this.range.moveTo(unwrapRange(target));
	}

	offset(rowOffset: number, columnOffset: number, numRows?: number, numColumns?: number): GasRange {
		if (numRows !== undefined && numRows !== null && numColumns !== undefined && numColumns !== null) {
			return new GasRange(this.range.offset(rowOffset, columnOffset, numRows, numColumns));
		}
		if (numRows !== undefined && numRows !== null) {
			return new GasRange(this.range.offset(rowOffset, columnOffset, numRows));
		}
		return new GasRange(this.range.offset(rowOffset, columnOffset));
	}

	setBackground(color?: string): GasRange {
		return new GasRange(this.range.setBackground(color ?? null));
	}

	setBackgrounds(colors: Array<Array<string | undefined>>): GasRange {
		const mapped: Array<Array<string | null>> = colors.map((row) => row.map((c) => c ?? null));
		return new GasRange(this.range.setBackgrounds(mapped));
	}

	setFontColor(color?: string): GasRange {
		return new GasRange(this.range.setFontColor(color ?? null));
	}

	setFontColors(colors: Array<Array<string | undefined>>): GasRange {
		const mapped: Array<Array<string | null>> = colors.map((row) => row.map((c) => c ?? null));
		return new GasRange(this.range.setFontColors(mapped));
	}

	setFontFamily(fontFamily?: string): GasRange {
		return new GasRange(this.range.setFontFamily(fontFamily ?? null));
	}

	setFontSize(size: number): GasRange {
		return new GasRange(this.range.setFontSize(size));
	}

	setFontStyle(fontStyle?: string): GasRange {
		const style = (fontStyle ?? null) as GasFontStyle;
		return new GasRange(this.range.setFontStyle(style));
	}

	setFontWeight(fontWeight?: string): GasRange {
		const weight = (fontWeight ?? null) as GasFontWeight;
		return new GasRange(this.range.setFontWeight(weight));
	}

	setFormula(formula: string): GasRange {
		return new GasRange(this.range.setFormula(formula));
	}

	setFormulas(formulas: string[][]): GasRange {
		return new GasRange(this.range.setFormulas(formulas));
	}

	setHorizontalAlignment(alignment?: string): GasRange {
		const align = (alignment ?? null) as GasHorizontalAlignment;
		return new GasRange(this.range.setHorizontalAlignment(align));
	}

	setNote(note?: string): GasRange {
		return new GasRange(this.range.setNote(note ?? null));
	}

	setNotes(notes: Array<Array<string | null>>): GasRange {
		return new GasRange(this.range.setNotes(notes));
	}

	setNumberFormat(numberFormat: string): GasRange {
		return new GasRange(this.range.setNumberFormat(numberFormat));
	}

	setNumberFormats(numberFormats: string[][]): GasRange {
		return new GasRange(this.range.setNumberFormats(numberFormats));
	}

	setValue(value: CellValue): GasRange {
		return new GasRange(this.range.setValue(fromWitCellValue(value)));
	}

	setValues(values: CellValue[][]): GasRange {
		const rawValues = values.map((row) => row.map(fromWitCellValue));
		return new GasRange(this.range.setValues(rawValues));
	}

	setVerticalAlignment(alignment?: string): GasRange {
		const align = (alignment ?? null) as GasVerticalAlignment;
		return new GasRange(this.range.setVerticalAlignment(align));
	}

	setWrap(isWrapEnabled: boolean): GasRange {
		return new GasRange(this.range.setWrap(Boolean(isWrapEnabled)));
	}

	sort(sortSpecs: SortSpec[]): GasRange {
		const specs = sortSpecs.map((s) => ({
			column: s.column,
			ascending: Boolean(s.ascending),
		}));
		return new GasRange(this.range.sort(specs));
	}

	trimWhitespace(): GasRange {
		return new GasRange(this.range.trimWhitespace());
	}

	uncheck(): GasRange {
		return new GasRange(this.range.uncheck());
	}
}

export function unwrapRange(range: GasRange | GoogleAppsScript.Spreadsheet.Range): GoogleAppsScript.Spreadsheet.Range {
	return range instanceof GasRange ? range.range : range;
}
