// gas:urlfetchapp/gas-http-response@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export class GasHttpResponse {
	/**
	 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} httpResponseObject
	 */
	constructor(httpResponseObject) {
		this.httpResponse = httpResponseObject;
	}

	getAllHeaders() {
		const raw = this.httpResponse.getAllHeaders() || {};
		return Object.entries(raw).map(([key, val]) => {
			if (Array.isArray(val)) {
				return [key, { tag: "multiple", val: val.map(String) }];
			}
			return [key, { tag: "single", val: String(val) }];
		});
	}

	getAs(contentType) {
		return new GasBlob(this.httpResponse.getAs(contentType));
	}

	getBlob() {
		return new GasBlob(this.httpResponse.getBlob());
	}

	getContent() {
		const bytes = this.httpResponse.getContent();
		return new Uint8Array(bytes);
	}

	getContentText(charset) {
		if (charset !== undefined && charset !== null) {
			return this.httpResponse.getContentText(charset);
		}
		return this.httpResponse.getContentText();
	}

	getHeaders() {
		const raw = this.httpResponse.getHeaders() || {};
		return Object.entries(raw).map(([key, val]) => [key, String(val)]);
	}

	getResponseCode() {
		return this.httpResponse.getResponseCode();
	}
};
