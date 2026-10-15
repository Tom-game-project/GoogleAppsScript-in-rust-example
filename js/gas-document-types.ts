// gas:document-app/gas-document-types@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export type ParagraphHeading =
	| "normal"
	| "heading1"
	| "heading2"
	| "heading3"
	| "heading4"
	| "heading5"
	| "heading6"
	| "title"
	| "subtitle";

export type HorizontalAlignment = "left" | "center" | "right" | "justify";

export function toWitParagraphHeading(h: GoogleAppsScript.Document.ParagraphHeading): ParagraphHeading {
	switch (h) {
		case DocumentApp.ParagraphHeading.HEADING1:
			return "heading1";
		case DocumentApp.ParagraphHeading.HEADING2:
			return "heading2";
		case DocumentApp.ParagraphHeading.HEADING3:
			return "heading3";
		case DocumentApp.ParagraphHeading.HEADING4:
			return "heading4";
		case DocumentApp.ParagraphHeading.HEADING5:
			return "heading5";
		case DocumentApp.ParagraphHeading.HEADING6:
			return "heading6";
		case DocumentApp.ParagraphHeading.TITLE:
			return "title";
		case DocumentApp.ParagraphHeading.SUBTITLE:
			return "subtitle";
		case DocumentApp.ParagraphHeading.NORMAL:
		default:
			return "normal";
	}
}

export function fromWitParagraphHeading(h: ParagraphHeading): GoogleAppsScript.Document.ParagraphHeading {
	switch (h) {
		case "heading1":
			return DocumentApp.ParagraphHeading.HEADING1;
		case "heading2":
			return DocumentApp.ParagraphHeading.HEADING2;
		case "heading3":
			return DocumentApp.ParagraphHeading.HEADING3;
		case "heading4":
			return DocumentApp.ParagraphHeading.HEADING4;
		case "heading5":
			return DocumentApp.ParagraphHeading.HEADING5;
		case "heading6":
			return DocumentApp.ParagraphHeading.HEADING6;
		case "title":
			return DocumentApp.ParagraphHeading.TITLE;
		case "subtitle":
			return DocumentApp.ParagraphHeading.SUBTITLE;
		case "normal":
		default:
			return DocumentApp.ParagraphHeading.NORMAL;
	}
}

export function toWitHorizontalAlignment(
	align: GoogleAppsScript.Document.HorizontalAlignment | null | undefined
): HorizontalAlignment | undefined {
	if (align === null || align === undefined) {
		return undefined;
	}
	switch (align) {
		case DocumentApp.HorizontalAlignment.CENTER:
			return "center";
		case DocumentApp.HorizontalAlignment.RIGHT:
			return "right";
		case DocumentApp.HorizontalAlignment.JUSTIFY:
			return "justify";
		case DocumentApp.HorizontalAlignment.LEFT:
		default:
			return "left";
	}
}

export function fromWitHorizontalAlignment(
	align: HorizontalAlignment
): GoogleAppsScript.Document.HorizontalAlignment {
	switch (align) {
		case "center":
			return DocumentApp.HorizontalAlignment.CENTER;
		case "right":
			return DocumentApp.HorizontalAlignment.RIGHT;
		case "justify":
			return DocumentApp.HorizontalAlignment.JUSTIFY;
		case "left":
		default:
			return DocumentApp.HorizontalAlignment.LEFT;
	}
}

export class GasText {
	public readonly text: GoogleAppsScript.Document.Text;

	constructor(textObject: GoogleAppsScript.Document.Text) {
		this.text = textObject;
	}

	appendText(text: string): GasText {
		return new GasText(this.text.appendText(text));
	}

	clear(): GasText {
		this.text.setText("");
		return this;
	}

	deleteText(startOffset: number, endOffsetInclusive: number): GasText {
		return new GasText(this.text.deleteText(startOffset, endOffsetInclusive));
	}

	getBackgroundColor(offset?: number): string | undefined {
		const c = offset !== undefined && offset !== null
			? this.text.getBackgroundColor(offset)
			: this.text.getBackgroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getFontFamily(offset?: number): string | undefined {
		const f = offset !== undefined && offset !== null
			? this.text.getFontFamily(offset)
			: this.text.getFontFamily();
		return f === null || f === undefined ? undefined : f;
	}

	getFontSize(offset?: number): number | undefined {
		const s = offset !== undefined && offset !== null
			? this.text.getFontSize(offset)
			: this.text.getFontSize();
		return s === null || s === undefined ? undefined : s;
	}

	getForegroundColor(offset?: number): string | undefined {
		const c = offset !== undefined && offset !== null
			? this.text.getForegroundColor(offset)
			: this.text.getForegroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getLinkUrl(offset?: number): string | undefined {
		const u = offset !== undefined && offset !== null
			? this.text.getLinkUrl(offset)
			: this.text.getLinkUrl();
		return u === null || u === undefined ? undefined : u;
	}

	getText(): string {
		return this.text.getText();
	}

	insertText(offset: number, text: string): GasText {
		return new GasText(this.text.insertText(offset, text));
	}

	isBold(offset?: number): boolean | undefined {
		const b = offset !== undefined && offset !== null
			? this.text.isBold(offset)
			: this.text.isBold();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isItalic(offset?: number): boolean | undefined {
		const b = offset !== undefined && offset !== null
			? this.text.isItalic(offset)
			: this.text.isItalic();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isStrikethrough(offset?: number): boolean | undefined {
		const b = offset !== undefined && offset !== null
			? this.text.isStrikethrough(offset)
			: this.text.isStrikethrough();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isUnderline(offset?: number): boolean | undefined {
		const b = offset !== undefined && offset !== null
			? this.text.isUnderline(offset)
			: this.text.isUnderline();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	replaceText(searchPattern: string, replacement: string): GasText {
		return new GasText(this.text.replaceText(searchPattern, replacement) as GoogleAppsScript.Document.Text);
	}

	setBackgroundColor(color?: string): GasText {
		return new GasText(this.text.setBackgroundColor(color ?? ""));
	}

	setBold(bold: boolean): GasText {
		return new GasText(this.text.setBold(Boolean(bold)));
	}

	setFontFamily(fontFamilyName: string): GasText {
		return new GasText(this.text.setFontFamily(fontFamilyName));
	}

	setFontSize(size: number): GasText {
		return new GasText(this.text.setFontSize(size));
	}

	setForegroundColor(color: string): GasText {
		return new GasText(this.text.setForegroundColor(color));
	}

	setItalic(italic: boolean): GasText {
		return new GasText(this.text.setItalic(Boolean(italic)));
	}

	setLinkUrl(url?: string): GasText {
		return new GasText(this.text.setLinkUrl(url ?? ""));
	}

	setStrikethrough(strikethrough: boolean): GasText {
		return new GasText(this.text.setStrikethrough(Boolean(strikethrough)));
	}

	setText(text: string): GasText {
		return new GasText(this.text.setText(text));
	}

	setUnderline(underline: boolean): GasText {
		return new GasText(this.text.setUnderline(Boolean(underline)));
	}
}

export class GasParagraph {
	public readonly paragraph: GoogleAppsScript.Document.Paragraph;

	constructor(paragraphObject: GoogleAppsScript.Document.Paragraph) {
		this.paragraph = paragraphObject;
	}

	appendText(text: string): GasText {
		return new GasText(this.paragraph.appendText(text));
	}

	clear(): GasParagraph {
		return new GasParagraph(this.paragraph.clear());
	}

	editAsText(): GasText {
		return new GasText(this.paragraph.editAsText());
	}

	getAlignment(): HorizontalAlignment | undefined {
		return toWitHorizontalAlignment(this.paragraph.getAlignment());
	}

	getHeading(): ParagraphHeading {
		return toWitParagraphHeading(this.paragraph.getHeading());
	}

	getIndentEnd(): number {
		return this.paragraph.getIndentEnd();
	}

	getIndentFirstLine(): number {
		return this.paragraph.getIndentFirstLine();
	}

	getIndentStart(): number {
		return this.paragraph.getIndentStart();
	}

	getLineSpacing(): number {
		return this.paragraph.getLineSpacing();
	}

	getLinkUrl(): string | undefined {
		const url = this.paragraph.getLinkUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getText(): string {
		return this.paragraph.getText();
	}

	replaceText(searchPattern: string, replacement: string): GasParagraph {
		return new GasParagraph(
			this.paragraph.replaceText(searchPattern, replacement) as GoogleAppsScript.Document.Paragraph
		);
	}

	setAlignment(alignment: HorizontalAlignment): GasParagraph {
		return new GasParagraph(this.paragraph.setAlignment(fromWitHorizontalAlignment(alignment)));
	}

	setHeading(heading: ParagraphHeading): GasParagraph {
		return new GasParagraph(this.paragraph.setHeading(fromWitParagraphHeading(heading)));
	}

	setIndentEnd(indentEnd: number): GasParagraph {
		return new GasParagraph(this.paragraph.setIndentEnd(indentEnd));
	}

	setIndentFirstLine(indentFirstLine: number): GasParagraph {
		return new GasParagraph(this.paragraph.setIndentFirstLine(indentFirstLine));
	}

	setIndentStart(indentStart: number): GasParagraph {
		return new GasParagraph(this.paragraph.setIndentStart(indentStart));
	}

	setLineSpacing(multiplier: number): GasParagraph {
		return new GasParagraph(this.paragraph.setLineSpacing(multiplier));
	}

	setLinkUrl(url?: string): GasParagraph {
		return new GasParagraph(this.paragraph.setLinkUrl(url ?? ""));
	}

	setText(text: string): void {
		this.paragraph.setText(text);
	}
}

export class GasTableCell {
	public readonly cell: GoogleAppsScript.Document.TableCell;

	constructor(cellObject: GoogleAppsScript.Document.TableCell) {
		this.cell = cellObject;
	}

	clear(): GasTableCell {
		return new GasTableCell(this.cell.clear());
	}

	editAsText(): GasText {
		return new GasText(this.cell.editAsText());
	}

	getBackgroundColor(): string | undefined {
		const c = this.cell.getBackgroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getText(): string {
		return this.cell.getText();
	}

	setBackgroundColor(color?: string): GasTableCell {
		return new GasTableCell(this.cell.setBackgroundColor(color ?? ""));
	}

	setText(text: string): GasTableCell {
		return new GasTableCell(this.cell.setText(text));
	}
}

export class GasTableRow {
	public readonly row: GoogleAppsScript.Document.TableRow;

	constructor(rowObject: GoogleAppsScript.Document.TableRow) {
		this.row = rowObject;
	}

	appendTableCell(textContents?: string): GasTableCell {
		if (textContents !== undefined && textContents !== null) {
			return new GasTableCell(this.row.appendTableCell(textContents));
		}
		return new GasTableCell(this.row.appendTableCell());
	}

	clear(): GasTableRow {
		return new GasTableRow(this.row.clear());
	}

	getCell(cellIndex: number): GasTableCell {
		return new GasTableCell(this.row.getCell(cellIndex));
	}

	getNumCells(): number {
		return this.row.getNumCells();
	}

	getText(): string {
		return this.row.getText();
	}

	removeCell(cellIndex: number): GasTableCell {
		return new GasTableCell(this.row.removeCell(cellIndex));
	}
}

export class GasTable {
	public readonly table: GoogleAppsScript.Document.Table;

	constructor(tableObject: GoogleAppsScript.Document.Table) {
		this.table = tableObject;
	}

	appendTableRow(): GasTableRow {
		return new GasTableRow(this.table.appendTableRow());
	}

	clear(): GasTable {
		return new GasTable(this.table.clear());
	}

	getBorderColor(): string | undefined {
		const c = this.table.getBorderColor();
		return c === null || c === undefined ? undefined : c;
	}

	getBorderWidth(): number {
		return this.table.getBorderWidth();
	}

	getCell(rowIndex: number, cellIndex: number): GasTableCell {
		return new GasTableCell(this.table.getCell(rowIndex, cellIndex));
	}

	getNumRows(): number {
		return this.table.getNumRows();
	}

	getRow(rowIndex: number): GasTableRow {
		return new GasTableRow(this.table.getRow(rowIndex));
	}

	getText(): string {
		return this.table.getText();
	}

	removeRow(rowIndex: number): GasTableRow {
		return new GasTableRow(this.table.removeRow(rowIndex));
	}

	setBorderColor(color: string): GasTable {
		return new GasTable(this.table.setBorderColor(color));
	}

	setBorderWidth(width: number): GasTable {
		return new GasTable(this.table.setBorderWidth(width));
	}
}

export class GasBody {
	public readonly body: GoogleAppsScript.Document.Body;

	constructor(bodyObject: GoogleAppsScript.Document.Body) {
		this.body = bodyObject;
	}

	appendHorizontalRule(): void {
		this.body.appendHorizontalRule();
	}

	appendPageBreak(): void {
		this.body.appendPageBreak();
	}

	appendParagraph(text: string): GasParagraph {
		return new GasParagraph(this.body.appendParagraph(text));
	}

	appendTable(cells?: string[][]): GasTable {
		if (cells !== undefined && cells !== null) {
			return new GasTable(this.body.appendTable(cells));
		}
		return new GasTable(this.body.appendTable());
	}

	clear(): GasBody {
		return new GasBody(this.body.clear());
	}

	editAsText(): GasText {
		return new GasText(this.body.editAsText());
	}

	getHeadingAttributes(paragraphHeading: ParagraphHeading): Array<[string, string]> {
		const raw = this.body.getHeadingAttributes(fromWitParagraphHeading(paragraphHeading)) ?? {};
		return Object.entries(raw).map(([k, v]): [string, string] => [String(k), String(v)]);
	}

	getMarginBottom(): number {
		return this.body.getMarginBottom();
	}

	getMarginLeft(): number {
		return this.body.getMarginLeft();
	}

	getMarginRight(): number {
		return this.body.getMarginRight();
	}

	getMarginTop(): number {
		return this.body.getMarginTop();
	}

	getPageHeight(): number {
		return this.body.getPageHeight();
	}

	getPageWidth(): number {
		return this.body.getPageWidth();
	}

	getParagraphs(): GasParagraph[] {
		return this.body.getParagraphs().map((p) => new GasParagraph(p));
	}

	getTables(): GasTable[] {
		return this.body.getTables().map((t) => new GasTable(t));
	}

	getText(): string {
		return this.body.getText();
	}

	replaceText(searchPattern: string, replacement: string): GasBody {
		return new GasBody(
			this.body.replaceText(searchPattern, replacement) as GoogleAppsScript.Document.Body
		);
	}

	setMarginBottom(margin: number): GasBody {
		return new GasBody(this.body.setMarginBottom(margin));
	}

	setMarginLeft(margin: number): GasBody {
		return new GasBody(this.body.setMarginLeft(margin));
	}

	setMarginRight(margin: number): GasBody {
		return new GasBody(this.body.setMarginRight(margin));
	}

	setMarginTop(margin: number): GasBody {
		return new GasBody(this.body.setMarginTop(margin));
	}

	setPageHeight(pageHeight: number): GasBody {
		return new GasBody(this.body.setPageHeight(pageHeight));
	}

	setPageWidth(pageWidth: number): GasBody {
		return new GasBody(this.body.setPageWidth(pageWidth));
	}

	setText(text: string): GasBody {
		return new GasBody(this.body.setText(text));
	}
}

export class GasDocument {
	public readonly document: GoogleAppsScript.Document.Document;

	constructor(documentObject: GoogleAppsScript.Document.Document) {
		this.document = documentObject;
	}

	getAs(contentType: string): GasBlob {
		return new GasBlob(this.document.getAs(contentType));
	}

	getBlob(): GasBlob {
		return new GasBlob(this.document.getBlob());
	}

	getBody(): GasBody {
		return new GasBody(this.document.getBody());
	}

	getId(): string {
		return this.document.getId();
	}

	getLanguage(): string {
		return this.document.getLanguage();
	}

	getName(): string {
		return this.document.getName();
	}

	getUrl(): string {
		return this.document.getUrl();
	}

	saveAndClose(): void {
		this.document.saveAndClose();
	}

	setLanguage(languageCode: string): GasDocument {
		return new GasDocument(this.document.setLanguage(languageCode));
	}

	setName(name: string): GasDocument {
		return new GasDocument(this.document.setName(name));
	}
}
