// gas:document-app/gas-document-types@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export function toWitParagraphHeading(h) {
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

export function fromWitParagraphHeading(h) {
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

export function toWitHorizontalAlignment(align) {
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

export function fromWitHorizontalAlignment(align) {
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
	constructor(textObject) {
		this.text = textObject;
	}

	appendText(text) {
		return new GasText(this.text.appendText(text));
	}

	clear() {
		return new GasText(this.text.clear());
	}

	deleteText(startOffset, endOffsetInclusive) {
		return new GasText(this.text.deleteText(startOffset, endOffsetInclusive));
	}

	getBackgroundColor(offset) {
		const c = offset !== undefined && offset !== null
			? this.text.getBackgroundColor(offset)
			: this.text.getBackgroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getFontFamily(offset) {
		const f = offset !== undefined && offset !== null
			? this.text.getFontFamily(offset)
			: this.text.getFontFamily();
		return f === null || f === undefined ? undefined : f;
	}

	getFontSize(offset) {
		const s = offset !== undefined && offset !== null
			? this.text.getFontSize(offset)
			: this.text.getFontSize();
		return s === null || s === undefined ? undefined : s;
	}

	getForegroundColor(offset) {
		const c = offset !== undefined && offset !== null
			? this.text.getForegroundColor(offset)
			: this.text.getForegroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getLinkUrl(offset) {
		const u = offset !== undefined && offset !== null
			? this.text.getLinkUrl(offset)
			: this.text.getLinkUrl();
		return u === null || u === undefined ? undefined : u;
	}

	getText() {
		return this.text.getText();
	}

	insertText(offset, text) {
		return new GasText(this.text.insertText(offset, text));
	}

	isBold(offset) {
		const b = offset !== undefined && offset !== null
			? this.text.isBold(offset)
			: this.text.isBold();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isItalic(offset) {
		const b = offset !== undefined && offset !== null
			? this.text.isItalic(offset)
			: this.text.isItalic();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isStrikethrough(offset) {
		const b = offset !== undefined && offset !== null
			? this.text.isStrikethrough(offset)
			: this.text.isStrikethrough();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	isUnderline(offset) {
		const b = offset !== undefined && offset !== null
			? this.text.isUnderline(offset)
			: this.text.isUnderline();
		return b === null || b === undefined ? undefined : Boolean(b);
	}

	replaceText(searchPattern, replacement) {
		return new GasText(this.text.replaceText(searchPattern, replacement));
	}

	setBackgroundColor(color) {
		return new GasText(this.text.setBackgroundColor(color ?? null));
	}

	setBold(bold) {
		return new GasText(this.text.setBold(Boolean(bold)));
	}

	setFontFamily(fontFamilyName) {
		return new GasText(this.text.setFontFamily(fontFamilyName));
	}

	setFontSize(size) {
		return new GasText(this.text.setFontSize(size));
	}

	setForegroundColor(color) {
		return new GasText(this.text.setForegroundColor(color));
	}

	setItalic(italic) {
		return new GasText(this.text.setItalic(Boolean(italic)));
	}

	setLinkUrl(url) {
		return new GasText(this.text.setLinkUrl(url ?? null));
	}

	setStrikethrough(strikethrough) {
		return new GasText(this.text.setStrikethrough(Boolean(strikethrough)));
	}

	setText(text) {
		return new GasText(this.text.setText(text));
	}

	setUnderline(underline) {
		return new GasText(this.text.setUnderline(Boolean(underline)));
	}
};

export class GasParagraph {
	constructor(paragraphObject) {
		this.paragraph = paragraphObject;
	}

	appendText(text) {
		return new GasText(this.paragraph.appendText(text));
	}

	clear() {
		return new GasParagraph(this.paragraph.clear());
	}

	editAsText() {
		return new GasText(this.paragraph.editAsText());
	}

	getAlignment() {
		return toWitHorizontalAlignment(this.paragraph.getAlignment());
	}

	getHeading() {
		return toWitParagraphHeading(this.paragraph.getHeading());
	}

	getIndentEnd() {
		return this.paragraph.getIndentEnd();
	}

	getIndentFirstLine() {
		return this.paragraph.getIndentFirstLine();
	}

	getIndentStart() {
		return this.paragraph.getIndentStart();
	}

	getLineSpacing() {
		return this.paragraph.getLineSpacing();
	}

	getLinkUrl() {
		const url = this.paragraph.getLinkUrl();
		return url === null || url === undefined ? undefined : url;
	}

	getText() {
		return this.paragraph.getText();
	}

	replaceText(searchPattern, replacement) {
		return new GasParagraph(this.paragraph.replaceText(searchPattern, replacement));
	}

	setAlignment(alignment) {
		return new GasParagraph(this.paragraph.setAlignment(fromWitHorizontalAlignment(alignment)));
	}

	setHeading(heading) {
		return new GasParagraph(this.paragraph.setHeading(fromWitParagraphHeading(heading)));
	}

	setIndentEnd(indentEnd) {
		return new GasParagraph(this.paragraph.setIndentEnd(indentEnd));
	}

	setIndentFirstLine(indentFirstLine) {
		return new GasParagraph(this.paragraph.setIndentFirstLine(indentFirstLine));
	}

	setIndentStart(indentStart) {
		return new GasParagraph(this.paragraph.setIndentStart(indentStart));
	}

	setLineSpacing(multiplier) {
		return new GasParagraph(this.paragraph.setLineSpacing(multiplier));
	}

	setLinkUrl(url) {
		return new GasParagraph(this.paragraph.setLinkUrl(url ?? null));
	}

	setText(text) {
		this.paragraph.setText(text);
	}
};

export class GasTableCell {
	constructor(cellObject) {
		this.cell = cellObject;
	}

	clear() {
		return new GasTableCell(this.cell.clear());
	}

	editAsText() {
		return new GasText(this.cell.editAsText());
	}

	getBackgroundColor() {
		const c = this.cell.getBackgroundColor();
		return c === null || c === undefined ? undefined : c;
	}

	getText() {
		return this.cell.getText();
	}

	setBackgroundColor(color) {
		return new GasTableCell(this.cell.setBackgroundColor(color ?? null));
	}

	setText(text) {
		return new GasTableCell(this.cell.setText(text));
	}
};

export class GasTableRow {
	constructor(rowObject) {
		this.row = rowObject;
	}

	appendTableCell(textContents) {
		if (textContents !== undefined && textContents !== null) {
			return new GasTableCell(this.row.appendTableCell(textContents));
		}
		return new GasTableCell(this.row.appendTableCell());
	}

	clear() {
		return new GasTableRow(this.row.clear());
	}

	getCell(cellIndex) {
		return new GasTableCell(this.row.getCell(cellIndex));
	}

	getNumCells() {
		return this.row.getNumCells();
	}

	getText() {
		return this.row.getText();
	}

	removeCell(cellIndex) {
		return new GasTableCell(this.row.removeCell(cellIndex));
	}
};

export class GasTable {
	constructor(tableObject) {
		this.table = tableObject;
	}

	appendTableRow() {
		return new GasTableRow(this.table.appendTableRow());
	}

	clear() {
		return new GasTable(this.table.clear());
	}

	getBorderColor() {
		const c = this.table.getBorderColor();
		return c === null || c === undefined ? undefined : c;
	}

	getBorderWidth() {
		return this.table.getBorderWidth();
	}

	getCell(rowIndex, cellIndex) {
		return new GasTableCell(this.table.getCell(rowIndex, cellIndex));
	}

	getNumRows() {
		return this.table.getNumRows();
	}

	getRow(rowIndex) {
		return new GasTableRow(this.table.getRow(rowIndex));
	}

	getText() {
		return this.table.getText();
	}

	removeRow(rowIndex) {
		return new GasTableRow(this.table.removeRow(rowIndex));
	}

	setBorderColor(color) {
		return new GasTable(this.table.setBorderColor(color));
	}

	setBorderWidth(width) {
		return new GasTable(this.table.setBorderWidth(width));
	}
};

export class GasBody {
	constructor(bodyObject) {
		this.body = bodyObject;
	}

	appendHorizontalRule() {
		this.body.appendHorizontalRule();
	}

	appendPageBreak() {
		this.body.appendPageBreak();
	}

	appendParagraph(text) {
		return new GasParagraph(this.body.appendParagraph(text));
	}

	appendTable(cells) {
		if (cells !== undefined && cells !== null) {
			return new GasTable(this.body.appendTable(cells));
		}
		return new GasTable(this.body.appendTable());
	}

	clear() {
		return new GasBody(this.body.clear());
	}

	editAsText() {
		return new GasText(this.body.editAsText());
	}

	getHeadingAttributes(paragraphHeading) {
		const raw = this.body.getHeadingAttributes(fromWitParagraphHeading(paragraphHeading)) || {};
		return Object.entries(raw).map(([k, v]) => [String(k), String(v)]);
	}

	getMarginBottom() {
		return this.body.getMarginBottom();
	}

	getMarginLeft() {
		return this.body.getMarginLeft();
	}

	getMarginRight() {
		return this.body.getMarginRight();
	}

	getMarginTop() {
		return this.body.getMarginTop();
	}

	getPageHeight() {
		return this.body.getPageHeight();
	}

	getPageWidth() {
		return this.body.getPageWidth();
	}

	getParagraphs() {
		return this.body.getParagraphs().map((p) => new GasParagraph(p));
	}

	getTables() {
		return this.body.getTables().map((t) => new GasTable(t));
	}

	getText() {
		return this.body.getText();
	}

	replaceText(searchPattern, replacement) {
		return new GasBody(this.body.replaceText(searchPattern, replacement));
	}

	setMarginBottom(margin) {
		return new GasBody(this.body.setMarginBottom(margin));
	}

	setMarginLeft(margin) {
		return new GasBody(this.body.setMarginLeft(margin));
	}

	setMarginRight(margin) {
		return new GasBody(this.body.setMarginRight(margin));
	}

	setMarginTop(margin) {
		return new GasBody(this.body.setMarginTop(margin));
	}

	setPageHeight(pageHeight) {
		return new GasBody(this.body.setPageHeight(pageHeight));
	}

	setPageWidth(pageWidth) {
		return new GasBody(this.body.setPageWidth(pageWidth));
	}

	setText(text) {
		return new GasBody(this.body.setText(text));
	}
};

export class GasDocument {
	constructor(documentObject) {
		this.document = documentObject;
	}

	getAs(contentType) {
		return new GasBlob(this.document.getAs(contentType));
	}

	getBlob() {
		return new GasBlob(this.document.getBlob());
	}

	getBody() {
		return new GasBody(this.document.getBody());
	}

	getId() {
		return this.document.getId();
	}

	getLanguage() {
		return this.document.getLanguage();
	}

	getName() {
		return this.document.getName();
	}

	getUrl() {
		return this.document.getUrl();
	}

	saveAndClose() {
		this.document.saveAndClose();
	}

	setLanguage(languageCode) {
		return new GasDocument(this.document.setLanguage(languageCode));
	}

	setName(name) {
		return new GasDocument(this.document.setName(name));
	}
};
