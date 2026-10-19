// gas:script-app/gas-script-types@0.1.0-alpha

export type AuthMode = "custom-function" | "full" | "limited" | "none";

export type AuthorizationStatus = "not-required" | "required";

export type EventType =
	| "clock"
	| "on-change"
	| "on-edit"
	| "on-event-updated"
	| "on-form-submit"
	| "on-open";

export type TriggerSource = "calendar" | "clock" | "documents" | "forms" | "spreadsheets";

export function fromWitAuthMode(mode: AuthMode): GoogleAppsScript.Script.AuthMode {
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

export function toWitAuthorizationStatus(
	status: GoogleAppsScript.Script.AuthorizationStatus
): AuthorizationStatus {
	switch (status) {
		case ScriptApp.AuthorizationStatus.REQUIRED:
			return "required";
		case ScriptApp.AuthorizationStatus.NOT_REQUIRED:
		default:
			return "not-required";
	}
}

export function toWitEventType(eventType: GoogleAppsScript.Script.EventType): EventType {
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

export function toWitTriggerSource(source: GoogleAppsScript.Script.TriggerSource): TriggerSource {
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
	public readonly authInfo: GoogleAppsScript.Script.AuthorizationInfo;

	constructor(authInfoObject: GoogleAppsScript.Script.AuthorizationInfo) {
		this.authInfo = authInfoObject;
	}

	getAuthorizationStatus(): AuthorizationStatus {
		return toWitAuthorizationStatus(this.authInfo.getAuthorizationStatus());
	}

	getAuthorizationUrl(): string | undefined {
		const url = this.authInfo.getAuthorizationUrl();
		return url === null || url === undefined ? undefined : url;
	}
}

export class GasService {
	public readonly service: GoogleAppsScript.Script.Service | null;

	constructor(serviceObject: GoogleAppsScript.Script.Service | null) {
		this.service = serviceObject;
	}

	disable(): void {
		if (this.service && typeof this.service.disable === "function") {
			this.service.disable();
		}
	}

	getUrl(): string | undefined {
		try {
			if (!this.service || typeof this.service.getUrl !== "function") {
				return undefined;
			}
			const url = this.service.getUrl();
			return url === null || url === undefined || url.trim() === "" ? undefined : url.trim();
		} catch {
			return undefined;
		}
	}

	isEnabled(): boolean {
		try {
			return this.service && typeof this.service.isEnabled === "function"
				? Boolean(this.service.isEnabled())
				: false;
		} catch {
			return false;
		}
	}
}

export class GasTrigger {
	public readonly trigger: GoogleAppsScript.Script.Trigger;

	constructor(triggerObject: GoogleAppsScript.Script.Trigger) {
		this.trigger = triggerObject;
	}

	getEventType(): EventType {
		return toWitEventType(this.trigger.getEventType());
	}

	getHandlerFunction(): string {
		return this.trigger.getHandlerFunction();
	}

	getTriggerSource(): TriggerSource {
		return toWitTriggerSource(this.trigger.getTriggerSource());
	}

	getTriggerSourceId(): string | undefined {
		const id = this.trigger.getTriggerSourceId();
		return id === null || id === undefined ? undefined : id;
	}

	getUniqueId(): string {
		return this.trigger.getUniqueId();
	}
}

export function unwrapTrigger(
	trigger: GasTrigger | GoogleAppsScript.Script.Trigger
): GoogleAppsScript.Script.Trigger {
	return trigger instanceof GasTrigger ? trigger.trigger : trigger;
}
