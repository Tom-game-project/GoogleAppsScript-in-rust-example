
export const GasHttpResponse = class GasHttpResponse {
	constructor(httpResponseObject) {
		this.httpResponse = httpResponseObject;
	}

    getContentText() { 
        return this.httpResponse.getContentText();
    }
}
