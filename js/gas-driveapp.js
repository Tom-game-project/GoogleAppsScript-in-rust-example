import { GasFile } from "./gas-driveapp-file";

export const getFileById = function (id)
{
	const f = DriveApp.getFileById(id);

	if (f===null)
	{
		return null;
	}
	return new GasFile(f);
}

export const getStorageUsed = function ()
{
	return DriveApp.getStorageUsed();
}
