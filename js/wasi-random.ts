// wasi:random/random@0.2.8

export function getRandomBytes(len: bigint | number): Uint8Array {
	const lengthAsNumber = Number(len);
	const bytes = new Uint8Array(lengthAsNumber);
	for (let i = 0; i < lengthAsNumber; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return bytes;
}

export function getRandomU64(): bigint {
	return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}
