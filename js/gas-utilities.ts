// gas:utilities/gas-utilities@0.1.0-alpha
import { GasBlob, unwrapBlob } from "./gas-driveapp-blob";

export type Charset = "us-ascii" | "utf8";

export type DigestAlgorithm = "md2" | "md5" | "sha1" | "sha256" | "sha384" | "sha512";

export type MacAlgorithm = "hmac-md5" | "hmac-sha1" | "hmac-sha256" | "hmac-sha384" | "hmac-sha512";

export type RsaAlgorithm = "rsa-sha1" | "rsa-sha256";

export type BinaryOrStringInput =
	| { tag: "bytes"; val: Uint8Array }
	| { tag: "text"; val: string }
	| { tag: "text-with-charset"; val: [string, Charset] };

export type HmacInput =
	| { tag: "bytes"; val: [Uint8Array, Uint8Array] }
	| { tag: "text"; val: [string, string] }
	| { tag: "text-with-charset"; val: [string, string, Charset] };

function fromWitCharset(charset: Charset): GoogleAppsScript.Utilities.Charset {
	switch (charset) {
		case "us-ascii":
			return Utilities.Charset.US_ASCII;
		case "utf8":
		default:
			return Utilities.Charset.UTF_8;
	}
}

function fromWitDigestAlgorithm(algo: DigestAlgorithm): GoogleAppsScript.Utilities.DigestAlgorithm {
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

function fromWitMacAlgorithm(algo: MacAlgorithm): GoogleAppsScript.Utilities.MacAlgorithm {
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

function fromWitRsaAlgorithm(algo: RsaAlgorithm): GoogleAppsScript.Utilities.RsaAlgorithm {
	switch (algo) {
		case "rsa-sha1":
			return Utilities.RsaAlgorithm.RSA_SHA_1;
		case "rsa-sha256":
		default:
			return Utilities.RsaAlgorithm.RSA_SHA_256;
	}
}

export function base64Decode(encoded: string, charset?: Charset): Uint8Array {
	const bytes = charset !== undefined && charset !== null
		? Utilities.base64Decode(encoded, fromWitCharset(charset))
		: Utilities.base64Decode(encoded);
	return new Uint8Array(bytes);
}

export function base64DecodeWebSafe(encoded: string, charset?: Charset): Uint8Array {
	const bytes = charset !== undefined && charset !== null
		? Utilities.base64DecodeWebSafe(encoded, fromWitCharset(charset))
		: Utilities.base64DecodeWebSafe(encoded);
	return new Uint8Array(bytes);
}

export function base64Encode(data: BinaryOrStringInput): string {
	if (data.tag === "bytes") {
		return Utilities.base64Encode(Array.from(data.val));
	}
	if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		return Utilities.base64Encode(text, fromWitCharset(cs));
	}
	return Utilities.base64Encode(data.val);
}

export function base64EncodeWebSafe(data: BinaryOrStringInput): string {
	if (data.tag === "bytes") {
		return Utilities.base64EncodeWebSafe(Array.from(data.val));
	}
	if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		return Utilities.base64EncodeWebSafe(text, fromWitCharset(cs));
	}
	return Utilities.base64EncodeWebSafe(data.val);
}

export function computeDigest(algorithm: DigestAlgorithm, value: BinaryOrStringInput): Uint8Array {
	const algo = fromWitDigestAlgorithm(algorithm);
	let bytes: GoogleAppsScript.Byte[];
	if (value.tag === "bytes") {
		bytes = Utilities.computeDigest(algo, Array.from(value.val));
	} else if (value.tag === "text-with-charset") {
		const [text, cs] = value.val;
		bytes = Utilities.computeDigest(algo, text, fromWitCharset(cs));
	} else {
		bytes = Utilities.computeDigest(algo, value.val);
	}
	return new Uint8Array(bytes);
}

export function computeHmacSha256Signature(input: HmacInput): Uint8Array {
	let bytes: GoogleAppsScript.Byte[];
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
}

export function computeHmacSignature(algorithm: MacAlgorithm, input: HmacInput): Uint8Array {
	const algo = fromWitMacAlgorithm(algorithm);
	let bytes: GoogleAppsScript.Byte[];
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
}

export function computeRsaSha1Signature(value: string, key: string, charset?: Charset): Uint8Array {
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSha1Signature(value, key, fromWitCharset(charset))
		: Utilities.computeRsaSha1Signature(value, key);
	return new Uint8Array(bytes);
}

export function computeRsaSha256Signature(value: string, key: string, charset?: Charset): Uint8Array {
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSha256Signature(value, key, fromWitCharset(charset))
		: Utilities.computeRsaSha256Signature(value, key);
	return new Uint8Array(bytes);
}

export function computeRsaSignature(
	algorithm: RsaAlgorithm,
	value: string,
	key: string,
	charset?: Charset
): Uint8Array {
	const algo = fromWitRsaAlgorithm(algorithm);
	const bytes = charset !== undefined && charset !== null
		? Utilities.computeRsaSignature(algo, value, key, fromWitCharset(charset))
		: Utilities.computeRsaSignature(algo, value, key);
	return new Uint8Array(bytes);
}

export function formatDate(dateEpochMillis: bigint, timeZone: string, format: string): string {
	return Utilities.formatDate(new Date(Number(dateEpochMillis)), timeZone, format);
}

export function formatString(template: string, args: string[]): string {
	return Utilities.formatString(template, ...(args ?? []));
}

export function getUuid(): string {
	return Utilities.getUuid();
}

export function gzip(blob: GasBlob, name?: string): GasBlob {
	const rawBlob = unwrapBlob(blob);
	if (name !== undefined && name !== null) {
		return new GasBlob(Utilities.gzip(rawBlob, name));
	}
	return new GasBlob(Utilities.gzip(rawBlob));
}

export function newBlob(data: BinaryOrStringInput, contentType?: string, name?: string): GasBlob {
	if (data.tag === "bytes") {
		const bytes = Array.from(data.val);
		if (contentType !== undefined && contentType !== null && name !== undefined && name !== null) {
			return new GasBlob(Utilities.newBlob(bytes, contentType, name));
		}
		if (contentType !== undefined && contentType !== null) {
			return new GasBlob(Utilities.newBlob(bytes, contentType));
		}
		return new GasBlob(Utilities.newBlob(bytes));
	}

	if (data.tag === "text-with-charset") {
		const [text, cs] = data.val;
		const b = contentType !== undefined && contentType !== null && name !== undefined && name !== null
			? Utilities.newBlob("", contentType, name)
			: contentType !== undefined && contentType !== null
				? Utilities.newBlob("", contentType)
				: Utilities.newBlob("");
		b.setDataFromString(text, fromWitCharset(cs).toString());
		return new GasBlob(b);
	}

	const text = data.val;
	if (contentType !== undefined && contentType !== null && name !== undefined && name !== null) {
		return new GasBlob(Utilities.newBlob(text, contentType, name));
	}
	if (contentType !== undefined && contentType !== null) {
		return new GasBlob(Utilities.newBlob(text, contentType));
	}
	return new GasBlob(Utilities.newBlob(text));
}

export function parseCsv(csv: string, delimiter?: string): string[][] {
	if (delimiter !== undefined && delimiter !== null && delimiter.length > 0) {
		return Utilities.parseCsv(csv, delimiter.charAt(0));
	}
	return Utilities.parseCsv(csv);
}

export function sleep(milliseconds: number): void {
	Utilities.sleep(milliseconds);
}

export function ungzip(blob: GasBlob): GasBlob {
	return new GasBlob(Utilities.ungzip(unwrapBlob(blob)));
}

export function unzip(blob: GasBlob): GasBlob[] {
	return Utilities.unzip(unwrapBlob(blob)).map((b) => new GasBlob(b));
}

export function zip(blobs: GasBlob[], name?: string): GasBlob {
	const rawBlobs = blobs.map(unwrapBlob);
	if (name !== undefined && name !== null) {
		return new GasBlob(Utilities.zip(rawBlobs, name));
	}
	return new GasBlob(Utilities.zip(rawBlobs));
}
