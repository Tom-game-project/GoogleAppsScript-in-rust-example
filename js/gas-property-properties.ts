// gas:property/properties@0.1.0-alpha

export class Properties {
	public readonly properties: GoogleAppsScript.Properties.Properties;

	constructor(propertiesObject: GoogleAppsScript.Properties.Properties) {
		this.properties = propertiesObject;
	}

	deleteAllProperties(): Properties {
		this.properties.deleteAllProperties();
		return this;
	}

	deleteProperty(key: string): Properties {
		this.properties.deleteProperty(key);
		return this;
	}

	getKeys(): string[] {
		return this.properties.getKeys();
	}

	getProperties(): Array<[string, string]> {
		const raw = this.properties.getProperties();
		return Object.entries(raw);
	}

	getProperty(key: string): string | undefined {
		const val = this.properties.getProperty(key);
		if (val !== null && val !== undefined && val.trim() !== "") {
			return val;
		}
		if (key === "GAS_WEB_APP_URL") {
			try {
				if (
					typeof ScriptApp !== "undefined" &&
					typeof ScriptApp.getService === "function"
				) {
					const serviceUrl = ScriptApp.getService().getUrl();
					if (serviceUrl && serviceUrl.trim() !== "") {
						return serviceUrl.trim();
					}
				}
			} catch {
				// ScriptApp.getService() が利用できない場合は無視
			}
		}
		return val === null ? undefined : val;
	}

	setProperties(entries: Array<[string, string]>, deleteAllOthers?: boolean): Properties {
		const dict: { [key: string]: string } = Object.fromEntries(entries);
		if (deleteAllOthers !== undefined && deleteAllOthers !== null) {
			this.properties.setProperties(dict, Boolean(deleteAllOthers));
		} else {
			this.properties.setProperties(dict);
		}
		return this;
	}

	setProperty(key: string, value: string): Properties {
		this.properties.setProperty(key, value);
		return this;
	}
}
