export const  getRandomBytes = (len)/*-> u64*/ => {
	const lengthAsNumber = Number(len);

	const bytes = new Uint8Array(lengthAsNumber);
	for (let i = 0; i < lengthAsNumber; i++) {
		bytes[i] = Math.floor(Math.random() * 256); // 0-255 のバイト
	}
	return bytes;
}

export const getRandomU64 = () => {
	return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
