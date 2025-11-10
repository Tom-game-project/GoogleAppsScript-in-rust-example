
export const GasTextOutput = class GasTextOutput {
	constructor(text_output) {
		this.text_output = text_output;
	}

	append(addedContent) {
		const r = this.text_output.append(addedContent);
		return new GasTextOutput(r);
	}

	clear() {
		const r = this.text_output.clear();
		return new GasTextOutput(r);
	}
};
