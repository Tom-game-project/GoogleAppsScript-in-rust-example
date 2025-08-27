import { GasSpreadsheet } from "./gas-spreadsheetapp-spreadsheet";


export const open = function (file) 
{
	const s = SpreadsheetApp.open(file);
	if (s === null)
	{
		return null;
	}
	return new GasSpreadsheet(s);
}

export const openById = function (id)
{
	const s = SpreadsheetApp.openById(id);
	if (s === null)
	{
		return null;
	}
	return new GasSpreadsheet(s);
}

export const openByUrl = function (url)
{
	const s = SpreadsheetApp.openByUrl(url);
	if (s === null)
	{
		return null;
	}
	return new GasSpreadsheet(s);
}
