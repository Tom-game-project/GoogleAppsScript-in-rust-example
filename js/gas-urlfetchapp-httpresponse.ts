// gas:urlfetchapp/gas-http-response@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

export type HttpMethod = "get" | "delete" | "patch" | "post" | "put";

export type HttpPayload =
	| { tag: "text"; val: string }
	| { tag: "bytes"; val: Uint8Array }
	| { tag: "form-data"; val: Array<[string, string]> }
	| { tag: "blob"; val: GasBlob };

export interface UrlFetchRequestOptions {
	contentType?: string;
	headers?: Array<[string, string]>;
	method?: HttpMethod;
	payload?: HttpPayload;
	useIntranet?: boolean;
	validateHttpsCertificates?: boolean;
	followRedirects?: boolean;
	muteHttpExceptions?: boolean;
	escaping?: boolean;
}

export interface UrlFetchRequest {
	url: string;
	params?: UrlFetchRequestOptions;
}

export type HeaderValue =
	| { tag: "single"; val: string }
	| { tag: "multiple"; val: string[] };

export class GasHttpResponse {
	public readonly httpResponse: GoogleAppsScript.URL_Fetch.HTTPResponse;

	constructor(httpResponseObject: GoogleAppsScript.URL_Fetch.HTTPResponse) {
		this.httpResponse = httpResponseObject;
	}

	getAllHeaders(): Array<[string, HeaderValue]> {
		const raw = (this.httpResponse.getAllHeaders() ?? {}) as Record<string, string | string[]>;
		return Object.entries(raw).map(([key, val]): [string, HeaderValue] => {
			if (Array.isArray(val)) {
				return [key, { tag: "multiple", val: val.map(String) }];
			}
			return [key, { tag: "single", val: String(val) }];
		});
	}

	getAs(contentType: string): GasBlob {
		return new GasBlob(this.httpResponse.getAs(contentType));
	}

	getBlob(): GasBlob {
		return new GasBlob(this.httpResponse.getBlob());
	}

	getContent(): Uint8Array {
		const bytes = this.httpResponse.getContent();
		return new Uint8Array(bytes);
	}

	getContentText(charset?: string): string {
		if (charset !== undefined && charset !== null) {
			return this.httpResponse.getContentText(charset);
		}
		return this.httpResponse.getContentText();
	}

	getHeaders(): Array<[string, string]> {
		const raw = (this.httpResponse.getHeaders() ?? {}) as Record<string, unknown>;
		return Object.entries(raw).map(([key, val]): [string, string] => [key, String(val)]);
	}

	getResponseCode(): number {
		return this.httpResponse.getResponseCode();
	}
}
