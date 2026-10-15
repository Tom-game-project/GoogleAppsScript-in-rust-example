// gas:urlfetchapp/gas-url-fetch-app@0.1.0-alpha
import { GasHttpResponse } from "./gas-urlfetchapp-httpresponse";

function toGasFetchOptions(params) {
	if (params === undefined || params === null) {
		return undefined;
	}
	const opts = {};
	if (params.contentType !== undefined && params.contentType !== null) {
		opts.contentType = params.contentType;
	}
	if (params.headers !== undefined && params.headers !== null) {
		opts.headers = Object.fromEntries(params.headers);
	}
	if (params.method !== undefined && params.method !== null) {
		opts.method = params.method;
	}
	if (params.payload !== undefined && params.payload !== null) {
		const p = params.payload;
		if (p.tag === "text") {
			opts.payload = p.val;
		} else if (p.tag === "bytes") {
			opts.payload = Array.from(p.val);
		} else if (p.tag === "form-data") {
			opts.payload = Object.fromEntries(p.val);
		} else if (p.tag === "blob") {
			opts.payload = p.val.blob ?? p.val;
		}
	}
	if (params.useIntranet !== undefined && params.useIntranet !== null) {
		opts.useIntranet = Boolean(params.useIntranet);
	}
	if (params.validateHttpsCertificates !== undefined && params.validateHttpsCertificates !== null) {
		opts.validateHttpsCertificates = Boolean(params.validateHttpsCertificates);
	}
	if (params.followRedirects !== undefined && params.followRedirects !== null) {
		opts.followRedirects = Boolean(params.followRedirects);
	}
	if (params.muteHttpExceptions !== undefined && params.muteHttpExceptions !== null) {
		opts.muteHttpExceptions = Boolean(params.muteHttpExceptions);
	}
	if (params.escaping !== undefined && params.escaping !== null) {
		opts.escaping = Boolean(params.escaping);
	}
	return opts;
}

export function fetch(url, params) {
	const opts = toGasFetchOptions(params);
	if (opts !== undefined) {
		return new GasHttpResponse(UrlFetchApp.fetch(url, opts));
	}
	return new GasHttpResponse(UrlFetchApp.fetch(url));
};

export function fetchAll(requests) {
	const gasRequests = requests.map((req) => {
		const opts = toGasFetchOptions(req.params);
		if (opts !== undefined) {
			return { url: req.url, ...opts };
		}
		return req.url;
	});
	return UrlFetchApp.fetchAll(gasRequests).map((res) => new GasHttpResponse(res));
};

export function getRequest(url, params) {
	const opts = toGasFetchOptions(params);
	const raw = opts !== undefined
		? UrlFetchApp.getRequest(url, opts)
		: UrlFetchApp.getRequest(url);
	return Object.entries(raw || {}).map(([k, v]) => [
		k,
		typeof v === "string" ? v : JSON.stringify(v),
	]);
};
