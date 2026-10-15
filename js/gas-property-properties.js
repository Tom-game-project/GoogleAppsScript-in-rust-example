// gas:property/properties@0.1.0-alpha

export class Properties {
	/**
	 * @param {GoogleAppsScript.Properties.Properties} propertiesObject
	 */
	constructor(propertiesObject) {
		this.properties = propertiesObject;
	}

	deleteAllProperties() {
		this.properties.deleteAllProperties();
		return this;
	}

	deleteProperty(key) {
		this.properties.deleteProperty(key);
		return this;
	}

	getKeys() {
		return this.properties.getKeys();
	}

	getProperties() {
		const raw = this.properties.getProperties();
		return Object.entries(raw);
	}

	getProperty(key) {
		const val = this.properties.getProperty(key);
		return val === null ? undefined : val;
	}

	setProperties(entries, deleteAllOthers) {
		const dict = Object.fromEntries(entries);
		if (deleteAllOthers !== undefined && deleteAllOthers !== null) {
			this.properties.setProperties(dict, Boolean(deleteAllOthers));
		} else {
			this.properties.setProperties(dict);
		}
		return this;
	}

	setProperty(key, value) {
		this.properties.setProperty(key, value);
		return this;
	}
};
