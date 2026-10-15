// gas:calendar-app/gas-calendar-app@0.1.0-alpha
import {
	GasCalendar,
	GasCalendarEvent,
	toGasEventOptions,
} from "./gas-calendar-types";

export function createAllDayEvent(title, startDateEpochMillis, endDateEpochMillis, options) {
	const start = new Date(Number(startDateEpochMillis));
	const opts = toGasEventOptions(options);
	if (endDateEpochMillis !== undefined && endDateEpochMillis !== null) {
		const end = new Date(Number(endDateEpochMillis));
		if (opts !== undefined) {
			return new GasCalendarEvent(CalendarApp.createAllDayEvent(title, start, end, opts));
		}
		return new GasCalendarEvent(CalendarApp.createAllDayEvent(title, start, end));
	}
	if (opts !== undefined) {
		return new GasCalendarEvent(CalendarApp.createAllDayEvent(title, start, opts));
	}
	return new GasCalendarEvent(CalendarApp.createAllDayEvent(title, start));
};

export function createCalendar(name, options) {
	if (options !== undefined && options !== null) {
		const opts = {};
		if (options.description !== undefined && options.description !== null) opts.summary = options.description;
		if (options.location !== undefined && options.location !== null) opts.location = options.location;
		return new GasCalendar(CalendarApp.createCalendar(name, opts));
	}
	return new GasCalendar(CalendarApp.createCalendar(name));
};

export function createEvent(title, startTimeEpochMillis, endTimeEpochMillis, options) {
	const start = new Date(Number(startTimeEpochMillis));
	const end = new Date(Number(endTimeEpochMillis));
	const opts = toGasEventOptions(options);
	if (opts !== undefined) {
		return new GasCalendarEvent(CalendarApp.createEvent(title, start, end, opts));
	}
	return new GasCalendarEvent(CalendarApp.createEvent(title, start, end));
};

export function createEventFromDescription(description) {
	return new GasCalendarEvent(CalendarApp.createEventFromDescription(description));
};

export function getAllCalendars() {
	return CalendarApp.getAllCalendars().map((c) => new GasCalendar(c));
};

export function getAllOwnedCalendars() {
	return CalendarApp.getAllOwnedCalendars().map((c) => new GasCalendar(c));
};

export function getCalendarById(id) {
	const c = CalendarApp.getCalendarById(id);
	return c === null || c === undefined ? undefined : new GasCalendar(c);
};

export function getCalendarsByName(name) {
	return CalendarApp.getCalendarsByName(name).map((c) => new GasCalendar(c));
};

export function getColor() {
	return CalendarApp.getColor();
};

export function getDefaultCalendar() {
	return new GasCalendar(CalendarApp.getDefaultCalendar());
};

export function getDescription() {
	return CalendarApp.getDescription();
};

export function getEventById(iCalId) {
	const ev = CalendarApp.getEventById(iCalId);
	return ev === null || ev === undefined ? undefined : new GasCalendarEvent(ev);
};

export function getEvents(startTimeEpochMillis, endTimeEpochMillis, search) {
	const start = new Date(Number(startTimeEpochMillis));
	const end = new Date(Number(endTimeEpochMillis));
	if (search !== undefined && search !== null) {
		return CalendarApp.getEvents(start, end, { search }).map((e) => new GasCalendarEvent(e));
	}
	return CalendarApp.getEvents(start, end).map((e) => new GasCalendarEvent(e));
};

export function getEventsForDay(dateEpochMillis, search) {
	const d = new Date(Number(dateEpochMillis));
	if (search !== undefined && search !== null) {
		return CalendarApp.getEventsForDay(d, { search }).map((e) => new GasCalendarEvent(e));
	}
	return CalendarApp.getEventsForDay(d).map((e) => new GasCalendarEvent(e));
};

export function getId() {
	return CalendarApp.getId();
};

export function getName() {
	return CalendarApp.getName();
};

export function getOwnedCalendarById(id) {
	const c = CalendarApp.getOwnedCalendarById(id);
	return c === null || c === undefined ? undefined : new GasCalendar(c);
};

export function getOwnedCalendarsByName(name) {
	return CalendarApp.getOwnedCalendarsByName(name).map((c) => new GasCalendar(c));
};

export function getTimeZone() {
	return CalendarApp.getTimeZone();
};

export function setColor(color) {
	return new GasCalendar(CalendarApp.setColor(color));
};

export function setDescription(description) {
	return new GasCalendar(CalendarApp.setDescription(description));
};

export function setName(name) {
	return new GasCalendar(CalendarApp.setName(name));
};

export function setTimeZone(timeZone) {
	return new GasCalendar(CalendarApp.setTimeZone(timeZone));
};

export function subscribeToCalendar(id) {
	return new GasCalendar(CalendarApp.subscribeToCalendar(id));
};
