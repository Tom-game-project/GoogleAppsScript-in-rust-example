// gas:calendar-app/gas-calendar-app@0.1.0-alpha
import {
	EventOptions,
	GasCalendar,
	GasCalendarEvent,
	toGasEventOptions,
} from "./gas-calendar-types";

export function createAllDayEvent(
	title: string,
	startDateEpochMillis: bigint,
	endDateEpochMillis?: bigint,
	options?: EventOptions
): GasCalendarEvent {
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
}

export function createCalendar(name: string, options?: EventOptions): GasCalendar {
	if (options !== undefined && options !== null) {
		const opts: { summary?: string; location?: string } = {};
		if (options.description !== undefined && options.description !== null) opts.summary = options.description;
		if (options.location !== undefined && options.location !== null) opts.location = options.location;
		return new GasCalendar(CalendarApp.createCalendar(name, opts));
	}
	return new GasCalendar(CalendarApp.createCalendar(name));
}

export function createEvent(
	title: string,
	startTimeEpochMillis: bigint,
	endTimeEpochMillis: bigint,
	options?: EventOptions
): GasCalendarEvent {
	const start = new Date(Number(startTimeEpochMillis));
	const end = new Date(Number(endTimeEpochMillis));
	const opts = toGasEventOptions(options);
	if (opts !== undefined) {
		return new GasCalendarEvent(CalendarApp.createEvent(title, start, end, opts));
	}
	return new GasCalendarEvent(CalendarApp.createEvent(title, start, end));
}

export function createEventFromDescription(description: string): GasCalendarEvent {
	return new GasCalendarEvent(CalendarApp.createEventFromDescription(description));
}

export function getAllCalendars(): GasCalendar[] {
	return CalendarApp.getAllCalendars().map((c) => new GasCalendar(c));
}

export function getAllOwnedCalendars(): GasCalendar[] {
	return CalendarApp.getAllOwnedCalendars().map((c) => new GasCalendar(c));
}

export function getCalendarById(id: string): GasCalendar | undefined {
	const c = CalendarApp.getCalendarById(id);
	return c === null || c === undefined ? undefined : new GasCalendar(c);
}

export function getCalendarsByName(name: string): GasCalendar[] {
	return CalendarApp.getCalendarsByName(name).map((c) => new GasCalendar(c));
}

export function getColor(): string {
	return CalendarApp.getColor();
}

export function getDefaultCalendar(): GasCalendar {
	return new GasCalendar(CalendarApp.getDefaultCalendar());
}

export function getDescription(): string {
	return CalendarApp.getDescription();
}

export function getEventById(iCalId: string): GasCalendarEvent | undefined {
	const ev = CalendarApp.getEventById(iCalId);
	return ev === null || ev === undefined ? undefined : new GasCalendarEvent(ev);
}

export function getEvents(
	startTimeEpochMillis: bigint,
	endTimeEpochMillis: bigint,
	search?: string
): GasCalendarEvent[] {
	const start = new Date(Number(startTimeEpochMillis));
	const end = new Date(Number(endTimeEpochMillis));
	if (search !== undefined && search !== null) {
		return CalendarApp.getEvents(start, end, { search }).map((e) => new GasCalendarEvent(e));
	}
	return CalendarApp.getEvents(start, end).map((e) => new GasCalendarEvent(e));
}

export function getEventsForDay(dateEpochMillis: bigint, search?: string): GasCalendarEvent[] {
	const d = new Date(Number(dateEpochMillis));
	if (search !== undefined && search !== null) {
		return CalendarApp.getEventsForDay(d, { search }).map((e) => new GasCalendarEvent(e));
	}
	return CalendarApp.getEventsForDay(d).map((e) => new GasCalendarEvent(e));
}

export function getId(): string {
	return CalendarApp.getId();
}

export function getName(): string {
	return CalendarApp.getName();
}

export function getOwnedCalendarById(id: string): GasCalendar | undefined {
	const c = CalendarApp.getOwnedCalendarById(id);
	return c === null || c === undefined ? undefined : new GasCalendar(c);
}

export function getOwnedCalendarsByName(name: string): GasCalendar[] {
	return CalendarApp.getOwnedCalendarsByName(name).map((c) => new GasCalendar(c));
}

export function getTimeZone(): string {
	return CalendarApp.getTimeZone();
}

export function setColor(color: string): GasCalendar {
	return new GasCalendar(CalendarApp.setColor(color));
}

export function setDescription(description: string): GasCalendar {
	return new GasCalendar(CalendarApp.setDescription(description));
}

export function setName(name: string): GasCalendar {
	return new GasCalendar(CalendarApp.setName(name));
}

export function setTimeZone(timeZone: string): GasCalendar {
	return new GasCalendar(CalendarApp.setTimeZone(timeZone));
}

export function subscribeToCalendar(id: string): GasCalendar {
	return new GasCalendar(CalendarApp.subscribeToCalendar(id));
}
