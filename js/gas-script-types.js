// gas:script-app/gas-script-types@0.1.0-alpha

export function fromWitAuthMode(mode) {
	switch (mode) {
		case "custom-function":
			return ScriptApp.AuthMode.CUSTOM_FUNCTION;
		case "limited":
			return ScriptApp.AuthMode.LIMITED;
		case "none":
			return ScriptApp.AuthMode.NONE;
		case "full":
		default:
			return ScriptApp.AuthMode.FULL;
	}
}

export function toWitAuthorizationStatus(status) {
	switch (status) {
		case ScriptApp.AuthorizationStatus.REQUIRED:
			return "required";
		case ScriptApp.AuthorizationStatus.NOT_REQUIRED:
		default:
			return "not-required";
	}
}

export function toWitEventType(eventType) {
	switch (eventType) {
		case ScriptApp.EventType.ON_CHANGE:
			return "on-change";
		case ScriptApp.EventType.ON_EDIT:
			return "on-edit";
		case ScriptApp.EventType.ON_EVENT_UPDATED:
			return "on-event-updated";
		case ScriptApp.EventType.ON_FORM_SUBMIT:
			return "on-form-submit";
		case ScriptApp.EventType.ON_OPEN:
			return "on-open";
		case ScriptApp.EventType.CLOCK:
		default:
			return "clock";
	}
}

export function toWitTriggerSource(source) {
	switch (source) {
		case ScriptApp.TriggerSource.CALENDAR:
			return "calendar";
		case ScriptApp.TriggerSource.DOCUMENTS:
			return "documents";
		case ScriptApp.TriggerSource.FORMS:
			return "forms";
		case ScriptApp.TriggerSource.SPREADSHEETS:
			return "spreadsheets";
		case ScriptApp.TriggerSource.CLOCK:
		default:
			return "clock";
	}
}

export class GasAuthorizationInfo {
	constructor(authInfoObject) {
		this.authInfo = authInfoObject;
	}

	getAuthorizationStatus() {
		return toWitAuthorizationStatus(this.authInfo.getAuthorizationStatus());
	}

	getAuthorizationUrl() {
		const url = this.authInfo.getAuthorizationUrl();
		return url === null || url === undefined ? undefined : url;
	}
};

export class GasTrigger {
	constructor(triggerObject) {
		this.trigger = triggerObject;
	}

	getEventType() {
		return toWitEventType(this.trigger.getEventType());
	}

	getHandlerFunction() {
		return this.trigger.getHandlerFunction();
	}

	getTriggerSource() {
		return toWitTriggerSource(this.trigger.getTriggerSource());
	}

	getTriggerSourceId() {
		const id = this.trigger.getTriggerSourceId();
		return id === null || id === undefined ? undefined : id;
	}

	getUniqueId() {
		return this.trigger.getUniqueId();
	}
};
