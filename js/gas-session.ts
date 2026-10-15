// gas:session/gas-session@0.1.0-alpha
import { GasUser } from "./gas-driveapp-file";

export function getActiveUser(): GasUser {
	return new GasUser(Session.getActiveUser());
}

export function getActiveUserLocale(): string {
	return Session.getActiveUserLocale();
}

export function getEffectiveUser(): GasUser {
	return new GasUser(Session.getEffectiveUser());
}

export function getScriptTimeZone(): string {
	return Session.getScriptTimeZone();
}

export function getTemporaryActiveUserKey(): string {
	return Session.getTemporaryActiveUserKey();
}
