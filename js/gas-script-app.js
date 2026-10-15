// gas:script-app/gas-script-app@0.1.0-alpha
import {
	GasAuthorizationInfo,
	GasTrigger,
	fromWitAuthMode,
} from "./gas-script-types";

export function deleteTrigger(trigger) {
	ScriptApp.deleteTrigger(trigger.trigger ?? trigger);
};

export function getAuthorizationInfo(authMode) {
	return new GasAuthorizationInfo(ScriptApp.getAuthorizationInfo(fromWitAuthMode(authMode)));
};

export function getIdentityToken() {
	return ScriptApp.getIdentityToken();
};

export function getOauthToken() {
	return ScriptApp.getOAuthToken();
};

export function getProjectTriggers() {
	return ScriptApp.getProjectTriggers().map((t) => new GasTrigger(t));
};

export function getScriptId() {
	return ScriptApp.getScriptId();
};

export function invalidateAuth() {
	ScriptApp.invalidateAuth();
};
