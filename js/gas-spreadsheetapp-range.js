
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
		const v_list = this.range.getValues();
		console.log(v_list);
		return v_list.map((i) => 
			i.map(
				(cell_value) => 
				{
					if (cell_value === "")
					{
						return {tag: "empty"};
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
						return {tag: "date-value", val: cell_value};
					}
					else
					{
						return {tag: "otherwise-value", val: cell_value};
					}
				}
			)
		);
	}
}
