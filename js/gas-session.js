// gas:session/gas-session@0.1.0-alpha
import { GasUser } from "./gas-driveapp-file";

export function getActiveUser() {
	return new GasUser(Session.getActiveUser());
};

export function getActiveUserLocale() {
	return Session.getActiveUserLocale();
};

export function getEffectiveUser() {
	return new GasUser(Session.getEffectiveUser());
};

export function getScriptTimeZone() {
	return Session.getScriptTimeZone();
};

export function getTemporaryActiveUserKey() {
	return Session.getTemporaryActiveUserKey();
};
