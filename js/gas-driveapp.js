import { GasFile } from "./gas-driveapp-file";

export const GasDriveApp = class a {
	constructor () {
		console.log("Host JS: DriveApp");
	}

	/**
	 * IDでファイルを取得します。
         * @param {string} id
         * @returns {GoogleAppsScript.Drive.File}
        */
	getFileById(id) {
		const f = DriveApp.getFileById(id);

		return new GasFile(f);
	}

	getStorageUsed ()
	{
		console.log("called getStorageUsed");
		return DriveApp.getStorageUsed();
	}
};

