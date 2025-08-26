

export const Properties = class Properties{
	/**
         * @param {GoogleAppsScript.Properties.Properties} propertiesObject
         */
	constructor(propertiesObject) 
	{
		// 実際のGAS Fileオブジェクトを保持します。
		this.properties = propertiesObject;
	}

	/**
         * @param {string}
	 * @returns {string}
         */
	getProperty(key) 
	{
		return this.properties.getProperty(key);
	}

	/**
	 * @returns {string[]}
         */
	getKeys()
	{
		return this.properties.getKeys();
	}
}
