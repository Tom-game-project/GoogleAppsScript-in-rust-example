// gas:calendar-app/gas-calendar-types@0.1.0-alpha

export function toWitGuestStatus(status) {
	switch (status) {
		case CalendarApp.GuestStatus.INVITED:
			return "invited";
		case CalendarApp.GuestStatus.MAYBE:
			return "maybe";
		case CalendarApp.GuestStatus.NO:
			return "no";
		case CalendarApp.GuestStatus.OWNER:
			return "owner";
		case CalendarApp.GuestStatus.YES:
		default:
			return "yes";
	}
}

export function fromWitGuestStatus(status) {
	switch (status) {
		case "invited":
			return CalendarApp.GuestStatus.INVITED;
		case "maybe":
			return CalendarApp.GuestStatus.MAYBE;
		case "no":
			return CalendarApp.GuestStatus.NO;
		case "owner":
			return CalendarApp.GuestStatus.OWNER;
		case "yes":
		default:
			return CalendarApp.GuestStatus.YES;
	}
}

export function toWitVisibility(vis) {
	switch (vis) {
		case CalendarApp.Visibility.CONFIDENTIAL:
			return "confidential";
		case CalendarApp.Visibility.PRIVATE:
			return "private";
		case CalendarApp.Visibility.PUBLIC:
			return "public";
		case CalendarApp.Visibility.DEFAULT:
		default:
			return "default-visibility";
	}
}

export function fromWitVisibility(vis) {
	switch (vis) {
		case "confidential":
			return CalendarApp.Visibility.CONFIDENTIAL;
		case "private":
			return CalendarApp.Visibility.PRIVATE;
		case "public":
			return CalendarApp.Visibility.PUBLIC;
		case "default-visibility":
		default:
			return CalendarApp.Visibility.DEFAULT;
	}
}

export function toGasEventOptions(options) {
	if (options === undefined || options === null) {
		return undefined;
	}
	const opts = {};
	if (options.description !== undefined && options.description !== null) opts.description = options.description;
	if (options.location !== undefined && options.location !== null) opts.location = options.location;
	if (options.guests !== undefined && options.guests !== null) opts.guests = options.guests;
	if (options.sendInvites !== undefined && options.sendInvites !== null) opts.sendInvites = Boolean(options.sendInvites);
	return opts;
}

export class GasEventGuest {
	constructor(guestObject) {
		this.guest = guestObject;
	}

	getAdditionalGuests() {
		return this.guest.getAdditionalGuests();
	}

	getEmail() {
		return this.guest.getEmail();
	}

	getGuestStatus() {
		return toWitGuestStatus(this.guest.getGuestStatus());
	}

	getName() {
		return this.guest.getName();
	}
};

export class GasCalendarEvent {
	constructor(eventObject) {
		this.event = eventObject;
	}

	addEmailReminder(minutesBefore) {
		return new GasCalendarEvent(this.event.addEmailReminder(minutesBefore));
	}

	addGuest(email) {
		return new GasCalendarEvent(this.event.addGuest(email));
	}

	addPopupReminder(minutesBefore) {
		return new GasCalendarEvent(this.event.addPopupReminder(minutesBefore));
	}

	anyoneCanAddSelf() {
		return Boolean(this.event.anyoneCanAddSelf());
	}

	deleteEvent() {
		this.event.deleteEvent();
	}

	getAllDayEndDate() {
		return BigInt(this.event.getAllDayEndDate().getTime());
	}

	getAllDayStartDate() {
		return BigInt(this.event.getAllDayStartDate().getTime());
	}

	getColor() {
		return this.event.getColor();
	}

	getCreators() {
		return this.event.getCreators();
	}

	getDateCreated() {
		return BigInt(this.event.getDateCreated().getTime());
	}

	getDescription() {
		return this.event.getDescription();
	}

	getEmailReminders() {
		return this.event.getEmailReminders();
	}

	getEndTime() {
		return BigInt(this.event.getEndTime().getTime());
	}

	getGuestByEmail(email) {
		const g = this.event.getGuestByEmail(email);
		return g === null || g === undefined ? undefined : new GasEventGuest(g);
	}

	getGuestList(includeOwner) {
		if (includeOwner !== undefined && includeOwner !== null) {
			return this.event.getGuestList(Boolean(includeOwner)).map((g) => new GasEventGuest(g));
		}
		return this.event.getGuestList().map((g) => new GasEventGuest(g));
	}

	getId() {
		return this.event.getId();
	}

	getLastUpdated() {
		return BigInt(this.event.getLastUpdated().getTime());
	}

	getLocation() {
		return this.event.getLocation();
	}

	getMyStatus() {
		return toWitGuestStatus(this.event.getMyStatus());
	}

	getOriginalCalendarId() {
		return this.event.getOriginalCalendarId();
	}

	getPopupReminders() {
		return this.event.getPopupReminders();
	}

	getStartTime() {
		return BigInt(this.event.getStartTime().getTime());
	}

	getTag(key) {
		const val = this.event.getTag(key);
		return val === null || val === undefined ? undefined : val;
	}

	getTitle() {
		return this.event.getTitle();
	}

	getVisibility() {
		return toWitVisibility(this.event.getVisibility());
	}

	guestsCanInviteOthers() {
		return Boolean(this.event.guestsCanInviteOthers());
	}

	guestsCanModify() {
		return Boolean(this.event.guestsCanModify());
	}

	guestsCanSeeGuests() {
		return Boolean(this.event.guestsCanSeeGuests());
	}

	isAllDayEvent() {
		return Boolean(this.event.isAllDayEvent());
	}

	isOwnedByMe() {
		return Boolean(this.event.isOwnedByMe());
	}

	isRecurringEvent() {
		return Boolean(this.event.isRecurringEvent());
	}

	removeAllReminders() {
		return new GasCalendarEvent(this.event.removeAllReminders());
	}

	removeGuest(email) {
		return new GasCalendarEvent(this.event.removeGuest(email));
	}

	setAllDayDate(dateEpochMillis) {
		return new GasCalendarEvent(this.event.setAllDayDate(new Date(Number(dateEpochMillis))));
	}

	setAllDayDates(startDateEpochMillis, endDateEpochMillis) {
		return new GasCalendarEvent(
			this.event.setAllDayDates(
				new Date(Number(startDateEpochMillis)),
				new Date(Number(endDateEpochMillis))
			)
		);
	}

	setAnyoneCanAddSelf(anyoneCanAddSelf) {
		return new GasCalendarEvent(this.event.setAnyoneCanAddSelf(Boolean(anyoneCanAddSelf)));
	}

	setColor(color) {
		return new GasCalendarEvent(this.event.setColor(color));
	}

	setDescription(description) {
		return new GasCalendarEvent(this.event.setDescription(description));
	}

	setGuestsCanInviteOthers(guestsCanInviteOthers) {
		return new GasCalendarEvent(this.event.setGuestsCanInviteOthers(Boolean(guestsCanInviteOthers)));
	}

	setGuestsCanModify(guestsCanModify) {
		return new GasCalendarEvent(this.event.setGuestsCanModify(Boolean(guestsCanModify)));
	}

	setGuestsCanSeeGuests(guestsCanSeeGuests) {
		return new GasCalendarEvent(this.event.setGuestsCanSeeGuests(Boolean(guestsCanSeeGuests)));
	}

	setLocation(location) {
		return new GasCalendarEvent(this.event.setLocation(location));
	}

	setMyStatus(status) {
		return new GasCalendarEvent(this.event.setMyStatus(fromWitGuestStatus(status)));
	}

	setTag(key, value) {
		return new GasCalendarEvent(this.event.setTag(key, value));
	}

	setTime(startTimeEpochMillis, endTimeEpochMillis) {
		return new GasCalendarEvent(
			this.event.setTime(
				new Date(Number(startTimeEpochMillis)),
				new Date(Number(endTimeEpochMillis))
			)
		);
	}

	setTitle(title) {
		return new GasCalendarEvent(this.event.setTitle(title));
	}

	setVisibility(visibility) {
		return new GasCalendarEvent(this.event.setVisibility(fromWitVisibility(visibility)));
	}
};

export class GasCalendar {
	constructor(calendarObject) {
		this.calendar = calendarObject;
	}

	createAllDayEvent(title, startDateEpochMillis, endDateEpochMillis, options) {
		const start = new Date(Number(startDateEpochMillis));
		const opts = toGasEventOptions(options);
		if (endDateEpochMillis !== undefined && endDateEpochMillis !== null) {
			const end = new Date(Number(endDateEpochMillis));
			if (opts !== undefined) {
				return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, end, opts));
			}
			return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, end));
		}
		if (opts !== undefined) {
			return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, opts));
		}
		return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start));
	}

	createEvent(title, startTimeEpochMillis, endTimeEpochMillis, options) {
		const start = new Date(Number(startTimeEpochMillis));
		const end = new Date(Number(endTimeEpochMillis));
		const opts = toGasEventOptions(options);
		if (opts !== undefined) {
			return new GasCalendarEvent(this.calendar.createEvent(title, start, end, opts));
		}
		return new GasCalendarEvent(this.calendar.createEvent(title, start, end));
	}

	createEventFromDescription(description) {
		return new GasCalendarEvent(this.calendar.createEventFromDescription(description));
	}

	deleteCalendar() {
		this.calendar.deleteCalendar();
	}

	getColor() {
		return this.calendar.getColor();
	}

	getDescription() {
		return this.calendar.getDescription();
	}

	getEventById(iCalId) {
		const ev = this.calendar.getEventById(iCalId);
		return ev === null || ev === undefined ? undefined : new GasCalendarEvent(ev);
	}

	getEvents(startTimeEpochMillis, endTimeEpochMillis, search) {
		const start = new Date(Number(startTimeEpochMillis));
		const end = new Date(Number(endTimeEpochMillis));
		if (search !== undefined && search !== null) {
			return this.calendar.getEvents(start, end, { search }).map((e) => new GasCalendarEvent(e));
		}
		return this.calendar.getEvents(start, end).map((e) => new GasCalendarEvent(e));
	}

	getEventsForDay(dateEpochMillis, search) {
		const d = new Date(Number(dateEpochMillis));
		if (search !== undefined && search !== null) {
			return this.calendar.getEventsForDay(d, { search }).map((e) => new GasCalendarEvent(e));
		}
		return this.calendar.getEventsForDay(d).map((e) => new GasCalendarEvent(e));
	}

	getId() {
		return this.calendar.getId();
	}

	getName() {
		return this.calendar.getName();
	}

	getTimeZone() {
		return this.calendar.getTimeZone();
	}

	isHidden() {
		return Boolean(this.calendar.isHidden());
	}

	isMyPrimaryCalendar() {
		return Boolean(this.calendar.isMyPrimaryCalendar());
	}

	isOwnedByMe() {
		return Boolean(this.calendar.isOwnedByMe());
	}

	isSelected() {
		return Boolean(this.calendar.isSelected());
	}

	setColor(color) {
		return new GasCalendar(this.calendar.setColor(color));
	}

	setDescription(description) {
		return new GasCalendar(this.calendar.setDescription(description));
	}

	setHidden(hidden) {
		return new GasCalendar(this.calendar.setHidden(Boolean(hidden)));
	}

	setName(name) {
		return new GasCalendar(this.calendar.setName(name));
	}

	setSelected(selected) {
		return new GasCalendar(this.calendar.setSelected(Boolean(selected)));
	}

	setTimeZone(timeZone) {
		return new GasCalendar(this.calendar.setTimeZone(timeZone));
	}
};
