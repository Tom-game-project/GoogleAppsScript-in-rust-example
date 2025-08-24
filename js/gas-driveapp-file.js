
export const GasFile = class File {
	/**
         * @param {GoogleAppsScript.Drive.File} fileObject
         */
	constructor(fileObject) {
		// 実際のGAS Fileオブジェクトを保持します。
		this.file = fileObject;
	}
	/**
	* ファイル名を取得します。
	* @returns {string}
	*/
	getName() {
		return this.file.getName();
	}
};
