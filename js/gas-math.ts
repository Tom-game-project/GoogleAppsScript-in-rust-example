// gas:math/gas-math@0.1.0-alpha

export function random(): number {
	return Math.random();
}

export function getRandomBytes(len: bigint | number): Uint8Array {
	Logger.log("getRandomBytes!");
	const lengthAsNumber = Number(len);
	const bytes = new Uint8Array(lengthAsNumber);
	for (let i = 0; i < lengthAsNumber; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	return bytes;
}
