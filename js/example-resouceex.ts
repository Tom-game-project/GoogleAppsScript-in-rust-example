// example:resouceex/example-resource

export class ExampleList {
	private _value: string = "";

	constructor() {
		console.log("JS Host: StringBuilder instance created.");
	}

	append(s: string): ExampleList {
		this._value += s;
		return this;
	}

	toString(): string {
		return this._value;
	}
}
