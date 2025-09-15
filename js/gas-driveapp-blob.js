
export const GasBlob = class Blob {
	constructor(blobObject) {
		this.blob = blobObject;
	}

	getBytes() {
		//console.log("DEBUG: called getBlob");
		const buf = this.blob.getBytes();
		const vec_u8 = new Uint8Array(buf);
		return vec_u8;
	}

	setBytes(data) {
		//console.log("DEBUG: called setBlob");
		this.blob.setBytes(Array.from(data));
		return this;
	}

	getDataAsString()
	{
		return this.blob.getDataAsString();
	}
};
