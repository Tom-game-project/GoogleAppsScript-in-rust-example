// gas:calendar-app/gas-calendar-types@0.1.0-alpha

export type GuestStatus = "invited" | "maybe" | "no" | "owner" | "yes";

export type Visibility = "confidential" | "default-visibility" | "private" | "public";

export interface EventOptions {
	description?: string;
	location?: string;
	guests?: string;
	sendInvites?: boolean;
}

export function toWitGuestStatus(status: GoogleAppsScript.Calendar.GuestStatus): GuestStatus {
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

export function fromWitGuestStatus(status: GuestStatus): GoogleAppsScript.Calendar.GuestStatus {
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

export function toWitVisibility(vis: GoogleAppsScript.Calendar.Visibility): Visibility {
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

export function fromWitVisibility(vis: Visibility): GoogleAppsScript.Calendar.Visibility {
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

export function toGasEventOptions(
	options?: EventOptions
): EventOptions | undefined {
	if (options === undefined || options === null) {
		return undefined;
	}
	const opts: EventOptions = {};
	if (options.description !== undefined && options.description !== null) opts.description = options.description;
	if (options.location !== undefined && options.location !== null) opts.location = options.location;
	if (options.guests !== undefined && options.guests !== null) opts.guests = options.guests;
	if (options.sendInvites !== undefined && options.sendInvites !== null) opts.sendInvites = Boolean(options.sendInvites);
	return opts;
}

export class GasEventGuest {
	public readonly guest: GoogleAppsScript.Calendar.EventGuest;

	constructor(guestObject: GoogleAppsScript.Calendar.EventGuest) {
		this.guest = guestObject;
	}

	getAdditionalGuests(): number {
		return this.guest.getAdditionalGuests();
	}

	getEmail(): string {
		return this.guest.getEmail();
	}

	getGuestStatus(): GuestStatus {
		return toWitGuestStatus(this.guest.getGuestStatus());
	}

	getName(): string {
		return this.guest.getName();
	}
}

export class GasCalendarEvent {
	public readonly event: GoogleAppsScript.Calendar.CalendarEvent;

	constructor(eventObject: GoogleAppsScript.Calendar.CalendarEvent) {
		this.event = eventObject;
	}

	addEmailReminder(minutesBefore: number): GasCalendarEvent {
		return new GasCalendarEvent(this.event.addEmailReminder(minutesBefore));
	}

	addGuest(email: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.addGuest(email));
	}

	addPopupReminder(minutesBefore: number): GasCalendarEvent {
		return new GasCalendarEvent(this.event.addPopupReminder(minutesBefore));
	}

	anyoneCanAddSelf(): boolean {
		return Boolean(this.event.anyoneCanAddSelf());
	}

	deleteEvent(): void {
		this.event.deleteEvent();
	}

	getAllDayEndDate(): bigint {
		return BigInt(this.event.getAllDayEndDate().getTime());
	}

	getAllDayStartDate(): bigint {
		return BigInt(this.event.getAllDayStartDate().getTime());
	}

	getColor(): string {
		return this.event.getColor();
	}

	getCreators(): string[] {
		return this.event.getCreators();
	}

	getDateCreated(): bigint {
		return BigInt(this.event.getDateCreated().getTime());
	}

	getDescription(): string {
		return this.event.getDescription();
	}

	getEmailReminders(): number[] {
		return this.event.getEmailReminders();
	}

	getEndTime(): bigint {
		return BigInt(this.event.getEndTime().getTime());
	}

	getGuestByEmail(email: string): GasEventGuest | undefined {
		const g = this.event.getGuestByEmail(email);
		return g === null || g === undefined ? undefined : new GasEventGuest(g);
	}

	getGuestList(includeOwner?: boolean): GasEventGuest[] {
		if (includeOwner !== undefined && includeOwner !== null) {
			return this.event.getGuestList(Boolean(includeOwner)).map((g) => new GasEventGuest(g));
		}
		return this.event.getGuestList().map((g) => new GasEventGuest(g));
	}

	getId(): string {
		return this.event.getId();
	}

	getLastUpdated(): bigint {
		return BigInt(this.event.getLastUpdated().getTime());
	}

	getLocation(): string {
		return this.event.getLocation();
	}

	getMyStatus(): GuestStatus {
		return toWitGuestStatus(this.event.getMyStatus());
	}

	getOriginalCalendarId(): string {
		return this.event.getOriginalCalendarId();
	}

	getPopupReminders(): number[] {
		return this.event.getPopupReminders();
	}

	getStartTime(): bigint {
		return BigInt(this.event.getStartTime().getTime());
	}

	getTag(key: string): string | undefined {
		const val = this.event.getTag(key);
		return val === null || val === undefined ? undefined : val;
	}

	getTitle(): string {
		return this.event.getTitle();
	}

	getVisibility(): Visibility {
		return toWitVisibility(this.event.getVisibility());
	}

	guestsCanInviteOthers(): boolean {
		return Boolean(this.event.guestsCanInviteOthers());
	}

	guestsCanModify(): boolean {
		return Boolean(this.event.guestsCanModify());
	}

	guestsCanSeeGuests(): boolean {
		return Boolean(this.event.guestsCanSeeGuests());
	}

	isAllDayEvent(): boolean {
		return Boolean(this.event.isAllDayEvent());
	}

	isOwnedByMe(): boolean {
		return Boolean(this.event.isOwnedByMe());
	}

	isRecurringEvent(): boolean {
		return Boolean(this.event.isRecurringEvent());
	}

	removeAllReminders(): GasCalendarEvent {
		return new GasCalendarEvent(this.event.removeAllReminders());
	}

	removeGuest(email: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.removeGuest(email));
	}

	setAllDayDate(dateEpochMillis: bigint): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setAllDayDate(new Date(Number(dateEpochMillis))));
	}

	setAllDayDates(startDateEpochMillis: bigint, endDateEpochMillis: bigint): GasCalendarEvent {
		return new GasCalendarEvent(
			this.event.setAllDayDates(
				new Date(Number(startDateEpochMillis)),
				new Date(Number(endDateEpochMillis))
			)
		);
	}

	setAnyoneCanAddSelf(anyoneCanAddSelf: boolean): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setAnyoneCanAddSelf(Boolean(anyoneCanAddSelf)));
	}

	setColor(color: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setColor(color));
	}

	setDescription(description: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setDescription(description));
	}

	setGuestsCanInviteOthers(guestsCanInviteOthers: boolean): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setGuestsCanInviteOthers(Boolean(guestsCanInviteOthers)));
	}

	setGuestsCanModify(guestsCanModify: boolean): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setGuestsCanModify(Boolean(guestsCanModify)));
	}

	setGuestsCanSeeGuests(guestsCanSeeGuests: boolean): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setGuestsCanSeeGuests(Boolean(guestsCanSeeGuests)));
	}

	setLocation(location: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setLocation(location));
	}

	setMyStatus(status: GuestStatus): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setMyStatus(fromWitGuestStatus(status)));
	}

	setTag(key: string, value: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setTag(key, value));
	}

	setTime(startTimeEpochMillis: bigint, endTimeEpochMillis: bigint): GasCalendarEvent {
		return new GasCalendarEvent(
			this.event.setTime(
				new Date(Number(startTimeEpochMillis)),
				new Date(Number(endTimeEpochMillis))
			)
		);
	}

	setTitle(title: string): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setTitle(title));
	}

	setVisibility(visibility: Visibility): GasCalendarEvent {
		return new GasCalendarEvent(this.event.setVisibility(fromWitVisibility(visibility)));
	}
}

export class GasCalendar {
	public readonly calendar: GoogleAppsScript.Calendar.Calendar;

	constructor(calendarObject: GoogleAppsScript.Calendar.Calendar) {
		this.calendar = calendarObject;
	}

	createAllDayEvent(
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
				return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, end, opts));
			}
			return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, end));
		}
		if (opts !== undefined) {
			return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start, opts));
		}
		return new GasCalendarEvent(this.calendar.createAllDayEvent(title, start));
	}

	createEvent(
		title: string,
		startTimeEpochMillis: bigint,
		endTimeEpochMillis: bigint,
		options?: EventOptions
	): GasCalendarEvent {
		const start = new Date(Number(startTimeEpochMillis));
		const end = new Date(Number(endTimeEpochMillis));
		const opts = toGasEventOptions(options);
		if (opts !== undefined) {
			return new GasCalendarEvent(this.calendar.createEvent(title, start, end, opts));
		}
		return new GasCalendarEvent(this.calendar.createEvent(title, start, end));
	}

	createEventFromDescription(description: string): GasCalendarEvent {
		return new GasCalendarEvent(this.calendar.createEventFromDescription(description));
	}

	deleteCalendar(): void {
		this.calendar.deleteCalendar();
	}

	getColor(): string {
		return this.calendar.getColor();
	}

	getDescription(): string {
		return this.calendar.getDescription();
	}

	getEventById(iCalId: string): GasCalendarEvent | undefined {
		const ev = this.calendar.getEventById(iCalId);
		return ev === null || ev === undefined ? undefined : new GasCalendarEvent(ev);
	}

	getEvents(startTimeEpochMillis: bigint, endTimeEpochMillis: bigint, search?: string): GasCalendarEvent[] {
		const start = new Date(Number(startTimeEpochMillis));
		const end = new Date(Number(endTimeEpochMillis));
		if (search !== undefined && search !== null) {
			return this.calendar.getEvents(start, end, { search }).map((e) => new GasCalendarEvent(e));
		}
		return this.calendar.getEvents(start, end).map((e) => new GasCalendarEvent(e));
	}

	getEventsForDay(dateEpochMillis: bigint, search?: string): GasCalendarEvent[] {
		const d = new Date(Number(dateEpochMillis));
		if (search !== undefined && search !== null) {
			return this.calendar.getEventsForDay(d, { search }).map((e) => new GasCalendarEvent(e));
		}
		return this.calendar.getEventsForDay(d).map((e) => new GasCalendarEvent(e));
	}

	getId(): string {
		return this.calendar.getId();
	}

	getName(): string {
		return this.calendar.getName();
	}

	getTimeZone(): string {
		return this.calendar.getTimeZone();
	}

	isHidden(): boolean {
		return Boolean(this.calendar.isHidden());
	}

	isMyPrimaryCalendar(): boolean {
		return Boolean(this.calendar.isMyPrimaryCalendar());
	}

	isOwnedByMe(): boolean {
		return Boolean(this.calendar.isOwnedByMe());
	}

	isSelected(): boolean {
		return Boolean(this.calendar.isSelected());
	}

	setColor(color: string): GasCalendar {
		return new GasCalendar(this.calendar.setColor(color));
	}

	setDescription(description: string): GasCalendar {
		return new GasCalendar(this.calendar.setDescription(description));
	}

	setHidden(hidden: boolean): GasCalendar {
		return new GasCalendar(this.calendar.setHidden(Boolean(hidden)));
	}

	setName(name: string): GasCalendar {
		return new GasCalendar(this.calendar.setName(name));
	}

	setSelected(selected: boolean): GasCalendar {
		return new GasCalendar(this.calendar.setSelected(Boolean(selected)));
	}

	setTimeZone(timeZone: string): GasCalendar {
		return new GasCalendar(this.calendar.setTimeZone(timeZone));
	}
}
