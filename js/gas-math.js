export function random() {
	return Math.random();
}

export const  getRandomBytes = (len)/*-> u64*/ => {
	Logger.log("getRandomBytes!");
	const lengthAsNumber = Number(len);

	const bytes = new Uint8Array(lengthAsNumber);
	for (let i = 0; i < lengthAsNumber; i++) {
		bytes[i] = Math.floor(Math.random() * 256); // 0-255 のバイト
	}
	return bytes;
}

