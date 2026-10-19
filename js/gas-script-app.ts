// gas:script-app/gas-script-app@0.1.0-alpha
import {
	AuthMode,
	fromWitAuthMode,
	GasAuthorizationInfo,
	GasService,
	GasTrigger,
	unwrapTrigger,
} from "./gas-script-types";

export function deleteTrigger(trigger: GasTrigger): void {
	ScriptApp.deleteTrigger(unwrapTrigger(trigger));
}

export function getAuthorizationInfo(authMode: AuthMode): GasAuthorizationInfo {
	return new GasAuthorizationInfo(ScriptApp.getAuthorizationInfo(fromWitAuthMode(authMode)));
}

export function getIdentityToken(): string {
	return ScriptApp.getIdentityToken();
}

export function getOauthToken(): string {
	return ScriptApp.getOAuthToken();
}

export function getProjectTriggers(): GasTrigger[] {
	return ScriptApp.getProjectTriggers().map((t) => new GasTrigger(t));
}

export function getScriptId(): string {
	return ScriptApp.getScriptId();
}

export function getService(): GasService {
	try {
		if (typeof ScriptApp !== "undefined" && typeof ScriptApp.getService === "function") {
			return new GasService(ScriptApp.getService());
		}
	} catch {
		// Fall through if ScriptApp.getService() is unavailable
	}
	return new GasService(null);
}

export function invalidateAuth(): void {
	ScriptApp.invalidateAuth();
}
