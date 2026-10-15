// gas:utilities/gas-utilities@0.1.0-alpha
import { GasBlob } from "./gas-driveapp-blob";

function fromWitCharset(charset) {
	switch (charset) {
		case "us-ascii":
			return Utilities.Charset.US_ASCII;
		case "utf8":
		default:
			return Utilities.Charset.UTF_8;
	}
}

function fromWitDigestAlgorithm(algo) {
	switch (algo) {
		case "md2":
			return Utilities.DigestAlgorithm.MD2;
		case "md5":
			return Utilities.DigestAlgorithm.MD5;
		case "sha1":
			return Utilities.DigestAlgorithm.SHA_1;
		case "sha256":
			return Utilities.DigestAlgorithm.SHA_256;
		case "sha384":
			return Utilities.DigestAlgorithm.SHA_384;
		case "sha512":
		default:
			return Utilities.DigestAlgorithm.SHA_512;
	}
}

function fromWitMacAlgorithm(algo) {
	switch (algo) {
		case "hmac-md5":
			return Utilities.MacAlgorithm.HMAC_MD5;
		case "hmac-sha1":
			return Utilities.MacAlgorithm.HMAC_SHA_1;
		case "hmac-sha256":
			return Utilities.MacAlgorithm.HMAC_SHA_256;
		case "hmac-sha384":
			return Utilities.MacAlgorithm.HMAC_SHA_384;
		case "hmac-sha512":
		default:
			return Utilities.MacAlgorithm.HMAC_SHA_512;
	}
}

function fromWitRsaAlgorithm(algo) {
	switch (algo) {
		case "rsa-sha1":
			return Utilities.RsaAlgorithm.RSA_SHA_1;
		case "rsa-sha256":
		default:
			return Utilities.RsaAlgorithm.RSA_SHA_256;
	}
}

export function base64Decode(encoded, charset) {
	const bytes = charset !== undefined && charset !== null
		? Utilities.base64Decode(encoded, fromWitCharset(charset))
		: Utilities.base64Decode(encoded);
	return new Uint8Array(bytes);
};

export function base64DecodeWebSafe(encoded, charset) {
	const bytes = charset !== undefined && charset !== null
		? Utilities.base64DecodeWebSafe(encoded, fromWitCharset(charset))
		: Utilities.base64DecodeWebSafe(encoded);
	return new Uint8Array(bytes);
};

export function base64Encode(data) {
	if (data.tag === "bytes") {
		return Utilities.base64Encode(Array.from(data.val));
	}
	if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		return Utilities.base64Encode(text, fromWitCharset(cs));
	}
	return Utilities.base64Encode(data.val);
};

export function base64EncodeWebSafe(data) {
	if (data.tag === "bytes") {
		return Utilities.base64EncodeWebSafe(Array.from(data.val));
	}
	if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		return Utilities.base64EncodeWebSafe(text, fromWitCharset(cs));
	}
	return Utilities.base64EncodeWebSafe(data.val);
};

export function computeDigest(algorithm, value) {
	const algo = fromWitDigestAlgorithm(algorithm);
	let bytes;
	if (value.tag === "bytes") {
		bytes = Utilities.computeDigest(algo, Array.from(value.val));
	} else if (value.tag === "text-with-charset") {
		const [text, cs] = value.val;
		bytes = Utilities.computeDigest(algo, text, fromWitCharset(cs));
	} else {
		bytes = Utilities.computeDigest(algo, value.val);
	}
	return new Uint8Array(bytes);
};

export function computeHmacSha256Signature(input) {
	let bytes;
	if (input.tag === "bytes") {
		const [val, key] = input.val;
		bytes = Utilities.computeHmacSha256Signature(Array.from(val), Array.from(key));
	} else if (input.tag === "text-with-charset") {
		const [val, key, cs] = input.val;
		bytes = Utilities.computeHmacSha256Signature(val, key, fromWitCharset(cs));
	} else {
		const [val, key] = input.val;
		bytes = Utilities.computeHmacSha256Signature(val, key);
	}
	return new Uint8Array(bytes);
};

export function computeHmacSignature(algorithm, input) {
	const algo = fromWitMacAlgorithm(algorithm);
	let bytes;
	if (input.tag === "bytes") {
		const [val, key] = input.val;
		bytes = Utilities.computeHmacSignature(algo, Array.from(val), Array.from(key));
	} else if (input.tag === "text-with-charset") {
		const [val, key, cs] = input.val;
		bytes = Utilities.computeHmacSignature(algo, val, key, fromWitCharset(cs));
	} else {
		const [val, key] = input.val;
		bytes = Utilities.computeHmacSignature(algo, val, key);
	}
	return new Uint8Array(bytes);
};

export function computeRsaSha1Signature(value, key, charset) {
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSha1Signature(value, key, fromWitCharset(charset))
		: Utilities.computeRsaSha1Signature(value, key);
	return new Uint8Array(bytes);
};

export function computeRsaSha256Signature(value, key, charset) {
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSha256Signature(value, key, fromWitCharset(charset))
		: Utilities.computeRsaSha256Signature(value, key);
	return new Uint8Array(bytes);
};

export function computeRsaSignature(algorithm, value, key, charset) {
	const algo = fromWitRsaAlgorithm(algorithm);
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSignature(algo, value, key, fromWitCharset(charset))
		: Utilities.computeRsaSignature(algo, value, key);
	return new Uint8Array(bytes);
};

export function formatDate(dateEpochMillis, timeZone, format) {
	return Utilities.formatDate(new Date(Number(dateEpochMillis)), timeZone, format);
};

export function formatString(template, args) {
	return Utilities.formatString(template, ...(args || []));
};

export function getUuid() {
	return Utilities.getUuid();
};

export function gzip(blob, name) {
	const rawBlob = blob.blob ?? blob;
	if (name !== undefined && name !== null) {
		return new GasBlob(Utilities.gzip(rawBlob, name));
	}
	return new GasBlob(Utilities.gzip(rawBlob));
};

export function newBlob(data, contentType, name) {
	let rawData;
	if (data.tag === "bytes") {
		rawData = Array.from(data.val);
	} else if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		const b = Utilities.newBlob("", contentType ?? undefined, name ?? undefined);
		b.setDataFromString(text, fromWitCharset(cs));
		return new GasBlob(b);
	} else {
		rawData = data.val;
	}

	if (contentType !== undefined && contentType !== null && name !== undefined && name !== null) {
		return new GasBlob(Utilities.newBlob(rawData, contentType, name));
	}
	if (contentType !== undefined && contentType !== null) {
		return new GasBlob(Utilities.newBlob(rawData, contentType));
	}
	return new GasBlob(Utilities.newBlob(rawData));
};

export function parseCsv(csv, delimiter) {
	if (delimiter !== undefined && delimiter !== null) {
		return Utilities.parseCsv(csv, String(delimiter).charCodeAt(0));
	}
	return Utilities.parseCsv(csv);
};

export function sleep(milliseconds) {
	Utilities.sleep(milliseconds);
};

export function ungzip(blob) {
	return new GasBlob(Utilities.ungzip(blob.blob ?? blob));
};

export function unzip(blob) {
	return Utilities.unzip(blob.blob ?? blob).map((b) => new GasBlob(b));
};

export function zip(blobs, name) {
	const rawBlobs = blobs.map((b) => b.blob ?? b);
	if (name !== undefined && name !== null) {
		return new GasBlob(Utilities.zip(rawBlobs, name));
	}
	return new GasBlob(Utilities.zip(rawBlobs));
};
