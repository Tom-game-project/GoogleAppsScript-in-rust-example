// wasi:random/random@0.3.2, wasi:random/insecure@0.3.2, wasi:random/insecure-seed@0.3.2
// (および wasi:random/random@0.2.0 互換)

let entropyCounter = 0;

function generateCsprngBlock(): Uint8Array<ArrayBuffer> {
	entropyCounter += 1;
	if (typeof Utilities !== "undefined" && typeof Utilities.getUuid === "function") {
		const seed = `${Utilities.getUuid()}:${Utilities.getUuid()}:${Date.now()}:${entropyCounter}`;
		const digest = Utilities.computeDigest(
			Utilities.DigestAlgorithm.SHA_256,
			seed,
		);
		const ab = new ArrayBuffer(digest.length);
		const out = new Uint8Array(ab);
		for (let i = 0; i < digest.length; i++) {
			const b = digest[i];
			out[i] = b < 0 ? b + 256 : b;
		}
		return out;
	}
	// GAS 以外のローカル検証環境向けフォールバック
	const ab = new ArrayBuffer(32);
	const out = new Uint8Array(ab);
	for (let i = 0; i < 32; i++) {
		out[i] = Math.floor(Math.random() * 256);
	}
	return out;
}

// wasi:random/random
export function getRandomBytes(maxLen: bigint | number): Uint8Array<ArrayBuffer> {
	const lengthAsNumber = Math.max(0, Number(maxLen));
	const ab = new ArrayBuffer(lengthAsNumber);
	const bytes = new Uint8Array(ab);
	let offset = 0;
	while (offset < lengthAsNumber) {
		const block = generateCsprngBlock();
		const copyLen = Math.min(block.length, lengthAsNumber - offset);
		bytes.set(block.subarray(0, copyLen), offset);
		offset += copyLen;
	}
	return bytes;
}

export function getRandomU64(): bigint {
	const bytes = getRandomBytes(8n);
	const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
	return view.getBigUint64(0, true);
}

// wasi:random/insecure
export function getInsecureRandomBytes(
	maxLen: bigint | number,
): Uint8Array<ArrayBuffer> {
	const lengthAsNumber = Math.max(0, Number(maxLen));
	const ab = new ArrayBuffer(lengthAsNumber);
	const bytes = new Uint8Array(ab);
	for (let i = 0; i < lengthAsNumber; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return bytes;
}

export function getInsecureRandomU64(): bigint {
	const high = BigInt(Math.floor(Math.random() * 0x1_0000_0000));
	const low = BigInt(Math.floor(Math.random() * 0x1_0000_0000));
	return (high << 32n) | low;
}

// wasi:random/insecure-seed
let cachedSeed: [bigint, bigint] | undefined;

export function getInsecureSeed(): [bigint, bigint] {
	if (cachedSeed === undefined) {
		cachedSeed = [getRandomU64(), getRandomU64()];
	}
	return cachedSeed;
}
