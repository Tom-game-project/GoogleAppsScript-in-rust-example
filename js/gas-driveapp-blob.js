// gas:drive-app/gas-blob@0.1.0-alpha

export class GasBlob {
	/**
	 * @param {GoogleAppsScript.Base.Blob} blobObject
	 */
	constructor(blobObject) {
		this.blob = blobObject;
	}

	copyBlob() {
		return new GasBlob(this.blob.copyBlob());
	}

	getAs(contentType) {
		return new GasBlob(this.blob.getAs(contentType));
	}

	getBytes() {
		const buf = this.blob.getBytes();
		return new Uint8Array(buf);
	}

	getContentType() {
		const ct = this.blob.getContentType();
		return ct === null || ct === undefined ? undefined : ct;
	}

	getDataAsString(charset) {
		if (charset !== undefined && charset !== null) {
			return this.blob.getDataAsString(charset);
		}
		return this.blob.getDataAsString();
	}

	getName() {
		const name = this.blob.getName();
		return name === null || name === undefined ? undefined : name;
	}

	isGoogleType() {
		return Boolean(this.blob.isGoogleType());
	}

	setBytes(data) {
		this.blob.setBytes(Array.from(data));
		return this;
	}

	setContentType(contentType) {
		this.blob.setContentType(contentType);
		return this;
	}

	setContentTypeFromExtension() {
		this.blob.setContentTypeFromExtension();
		return this;
	}

	setDataFromString(data, charset) {
		if (charset !== undefined && charset !== null) {
			this.blob.setDataFromString(data, charset);
		} else {
			this.blob.setDataFromString(data);
		}
		return this;
	}

	setName(name) {
		this.blob.setName(name);
		return this;
	}
};
