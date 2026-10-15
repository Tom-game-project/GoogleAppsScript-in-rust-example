// gas:drive-app/gas-blob@0.1.0-alpha

export class GasBlob {
	public readonly blob: GoogleAppsScript.Base.Blob;

	constructor(blobObject: GoogleAppsScript.Base.Blob) {
		this.blob = blobObject;
	}

	copyBlob(): GasBlob {
		return new GasBlob(this.blob.copyBlob());
	}

	getAs(contentType: string): GasBlob {
		return new GasBlob(this.blob.getAs(contentType));
	}

	getBytes(): Uint8Array {
		const buf = this.blob.getBytes();
		return new Uint8Array(buf);
	}

	getContentType(): string | undefined {
		const ct = this.blob.getContentType();
		return ct === null || ct === undefined ? undefined : ct;
	}

	getDataAsString(charset?: string): string {
		if (charset !== undefined && charset !== null) {
			return this.blob.getDataAsString(charset);
		}
		return this.blob.getDataAsString();
	}

	getName(): string | undefined {
		const name = this.blob.getName();
		return name === null || name === undefined ? undefined : name;
	}

	isGoogleType(): boolean {
		return Boolean(this.blob.isGoogleType());
	}

	setBytes(data: Uint8Array): GasBlob {
		this.blob.setBytes(Array.from(data));
		return this;
	}

	setContentType(contentType: string): GasBlob {
		this.blob.setContentType(contentType);
		return this;
	}

	setContentTypeFromExtension(): GasBlob {
		this.blob.setContentTypeFromExtension();
		return this;
	}

	setDataFromString(data: string, charset?: string): GasBlob {
		if (charset !== undefined && charset !== null) {
			this.blob.setDataFromString(data, charset);
		} else {
			this.blob.setDataFromString(data);
		}
		return this;
	}

	setName(name: string): GasBlob {
		this.blob.setName(name);
		return this;
	}
}

export function unwrapBlob(blob: GasBlob | GoogleAppsScript.Base.Blob): GoogleAppsScript.Base.Blob {
	return blob instanceof GasBlob ? blob.blob : blob;
}
