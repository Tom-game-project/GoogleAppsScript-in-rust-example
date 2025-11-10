
export const GasRange = class GasRange 
{
	/**
	 *
	 * @param {GoogleAppsScript.Spreadsheet.Range} rangeObject 
	 * @returns 
	 */
	constructor (rangeObject)
	{
		this.range = rangeObject;
	}

	getValues()
	{
		console.log("DEBUG msg: get_values called");
		let a = this.range.getValues().map((i) => i.map(
		(cell_value) => 
		{
			if (cell_value === "")
			{
				return {tag: "empty", val: cell_value};
			}
			else if (typeof cell_value === "string")
			{
				return {tag: "string-value", val: cell_value};
			}
			else if (typeof cell_value === "number")
			{
				return {tag: "number-value", val: cell_value};
			}
			else if (typeof cell_value === "boolean")
			{
				return {tag: "boolean-value", val: cell_value};
			}
			else if (cell_value instanceof Date)
			{
				// TODO cell_valueは時間情報を含める最小のデータを用いたい
				return {tag: "date-value", val: cell_value.toISOString()};
			}
			else
			{
				return {tag: "otherwise-value", val: cell_value};
			}
		}
			)
		);
		console.log(a);
		return a;
	}
}
