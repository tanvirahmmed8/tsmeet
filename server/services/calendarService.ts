export type CalendarTimeWindow = {
  start: string;
  end: string;
};

export type CalendarType = 'personal' | 'event' | 'round_robin';

export type CalendarSettings = {
  calendarType?: CalendarType;
  eventCapacity?: number;
  autoRecordMeeting?: boolean;
  roundRobinMembers?: Array<{
    id?: number;
    email?: string;
    name?: string;
    availability?: Record<string, CalendarTimeWindow[]>;
  }>;
  slotDurationMinutes?: number;
  slotIntervalMinutes?: number;
  bufferBeforeMinutes?: number;
  bookingWindowDays?: number;
  dailySlotLimit?: number;
  availability?: Record<string, CalendarTimeWindow[]>;
  notificationPreferences?: {
    creatorEmailEnabled?: boolean;
    bookerEmailEnabled?: boolean;
  };
  reminderOffsetsMinutes?: number[];
  embedEnabled?: boolean;
  shareEnabled?: boolean;
  allowCancellation?: boolean;
  allowRescheduling?: boolean;
  customFields?: Array<Record<string, any>>;
};

export type CalendarRecord = {
  id: string;
  creator_id: number;
  slug: string;
  title: string;
  description?: string | null;
  timezone: string;
  confirmation_message?: string | null;
  settings?: CalendarSettings | string | null;
  booking_form?: { fields?: Array<Record<string, any>> } | string | null;
  created_at?: string;
  updated_at?: string;
  ended_at?: string | null;
};

export type DisabledSlotRecord = {
  start_at: string;
  end_at: string;
  reason?: string | null;
};

export type HolidayRecord = {
  holiday_date: string;
  label?: string | null;
  is_full_day?: boolean;
};

export type BookingRecord = {
  id: string;
  calendar_id: string;
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assigned_user_email?: string | null;
  slot_start_at: string;
  slot_end_at: string;
  status: string;
  booker_name: string;
  booker_email?: string | null;
  responses?: Record<string, any>;
  meeting_url?: string | null;
  meeting_provider?: string | null;
  confirmation_message?: string | null;
  reminder_offsets?: number[] | string | null;
  reminder_schedule?: Array<{ minutesBefore: number; remindAt: string }> | string | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimezone(tz: string): string {
  return isValidTimezone(tz) ? tz : 'UTC';
}

export function safeJsonParse<T>(value: string, fallback: T = {} as T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeCalendarType(value: any): CalendarType {
  if (value === 'event' || value === 'round_robin' || value === 'personal') {
    return value;
  }
  return 'personal';
}

function normalizeMemberAvailability(value: any): Record<string, CalendarTimeWindow[]> {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, CalendarTimeWindow[]> = {};
  for (const day of WEEKDAY_KEYS) {
    const windows = Array.isArray((value as Record<string, any>)[day]) ? (value as Record<string, any>)[day] : [];
    output[day] = windows
      .map((window: any) => ({
        start: String(window?.start || ''),
        end: String(window?.end || ''),
      }))
      .filter((window: CalendarTimeWindow) => /^\d{2}:\d{2}$/.test(window.start) && /^\d{2}:\d{2}$/.test(window.end));
  }
  return output;
}

export function normalizeRoundRobinMembers(value: any): Array<{
  id?: number;
  email?: string;
  name?: string;
  availability?: Record<string, CalendarTimeWindow[]>;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((member) => ({
      id: Number.isFinite(Number(member?.id)) ? Number(member?.id) : undefined,
      email: typeof member?.email === 'string' ? member.email : undefined,
      name: typeof member?.name === 'string' ? member.name : undefined,
      availability: normalizeMemberAvailability(member?.availability),
    }))
    .filter((member) => Number.isFinite(member.id) || Boolean(member.email));
}

export function normalizeCalendarSettings(settings: CalendarSettings | string | null | undefined): Required<CalendarSettings> & CalendarSettings {
  const parsed: any = typeof settings === 'string' ? safeJsonParse<any>(settings) : settings || {};
  const calendarType = normalizeCalendarType(parsed.calendarType);
  const eventCapacity = Math.max(1, Number(parsed.eventCapacity || 1));
  const roundRobinMembers = normalizeRoundRobinMembers(parsed.roundRobinMembers);
  return {
    calendarType,
    eventCapacity,
    autoRecordMeeting: parsed.autoRecordMeeting ?? false,
    roundRobinMembers,
    slotDurationMinutes: Math.max(1, Number(parsed.slotDurationMinutes || 30)),
    slotIntervalMinutes: Math.max(1, Number(parsed.slotIntervalMinutes || parsed.slotDurationMinutes || 30)),
    bufferBeforeMinutes: Math.max(0, Number(parsed.bufferBeforeMinutes || 0)),
    bookingWindowDays: Math.max(1, Number(parsed.bookingWindowDays || 30)),
    dailySlotLimit: Math.max(0, Number(parsed.dailySlotLimit || 0)),
    availability: parsed.availability || {},
    notificationPreferences: {
      creatorEmailEnabled: parsed.notificationPreferences?.creatorEmailEnabled ?? true,
      bookerEmailEnabled: parsed.notificationPreferences?.bookerEmailEnabled ?? true,
    },
    reminderOffsetsMinutes: Array.isArray(parsed.reminderOffsetsMinutes) && parsed.reminderOffsetsMinutes.length > 0
      ? parsed.reminderOffsetsMinutes.map((value: any) => Number(value)).filter(Number.isFinite)
      : [10, 5, 1],
    embedEnabled: parsed.embedEnabled ?? true,
    shareEnabled: parsed.shareEnabled ?? true,
    allowCancellation: parsed.allowCancellation ?? true,
    allowRescheduling: parsed.allowRescheduling ?? false,
    customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
  };
}

export function getSlotCapacity(settings: CalendarSettings) {
  const calendarType = normalizeCalendarType(settings.calendarType);
  if (calendarType === 'event') {
    return Math.max(1, Number(settings.eventCapacity || 1));
  }
  if (calendarType === 'round_robin') {
    const memberCount = Array.isArray(settings.roundRobinMembers) ? settings.roundRobinMembers.length : 0;
    return Math.max(0, memberCount);
  }
  return 1;
}

function isRoundRobinMemberAvailableForSlot(
  member: { availability?: Record<string, CalendarTimeWindow[]> },
  dayKey: string,
  startLocal: string,
  endLocal: string
) {
  const availability = member.availability || {};
  const dayWindows = Array.isArray(availability[dayKey]) ? availability[dayKey] : [];

  // If no per-member windows defined, member is available wherever the calendar is open.
  if (dayWindows.length === 0) return true;

  const slotStart = parseMinutes(startLocal);
  const slotEnd = parseMinutes(endLocal);
  return dayWindows.some((window) => {
    const start = parseMinutes(window.start);
    const end = parseMinutes(window.end);
    return slotStart >= start && slotEnd <= end;
  });
}

export function selectRoundRobinAssignee(
  settings: CalendarSettings,
  existingBookings: BookingRecord[],
  slotStartAt: string,
  slotEndAt: string,
  timeZone: string
) {
  const members = normalizeRoundRobinMembers(settings.roundRobinMembers);
  if (members.length === 0) return null;
  const membersWithIds = members.filter((member) => Number.isFinite(member.id)) as Array<{
    id: number;
    email?: string;
    name?: string;
    availability?: Record<string, CalendarTimeWindow[]>;
  }>;
  if (membersWithIds.length === 0) return null;

  const slotStart = new Date(slotStartAt);
  const slotEnd = new Date(slotEndAt);
  const date = formatDateString(slotStart, timeZone);
  const dayKey = getWeekdayKey(date, timeZone);
  const startLocalParts = getDatePartsInTimeZone(slotStart, timeZone);
  const endLocalParts = getDatePartsInTimeZone(slotEnd, timeZone);
  const startLocal = `${startLocalParts.hour.toString().padStart(2, '0')}:${startLocalParts.minute.toString().padStart(2, '0')}`;
  const endLocal = `${endLocalParts.hour.toString().padStart(2, '0')}:${endLocalParts.minute.toString().padStart(2, '0')}`;
  const slotBookings = existingBookings.filter(
    (booking) =>
      booking.status === 'confirmed' &&
      rangesOverlap(slotStart, slotEnd, new Date(booking.slot_start_at), new Date(booking.slot_end_at))
  );

  const busyMemberIds = new Set(
    slotBookings
      .map((booking) => Number(booking.assigned_user_id))
      .filter((memberId) => Number.isFinite(memberId))
  );
  const availableMembers = membersWithIds.filter((member) => {
    if (busyMemberIds.has(member.id)) return false;
    return isRoundRobinMemberAvailableForSlot(member, dayKey, startLocal, endLocal);
  });
  if (availableMembers.length === 0) return null;

  // Fair distribution: choose the least-assigned available member across confirmed bookings.
  const assignmentCount = new Map<number, number>();
  for (const member of membersWithIds) {
    assignmentCount.set(member.id, 0);
  }
  for (const booking of existingBookings) {
    if (booking.status !== 'confirmed') continue;
    const memberId = Number(booking.assigned_user_id);
    if (Number.isFinite(memberId) && assignmentCount.has(memberId)) {
      assignmentCount.set(memberId, (assignmentCount.get(memberId) || 0) + 1);
    }
  }

  availableMembers.sort((a, b) => {
    const countDiff = (assignmentCount.get(a.id) || 0) - (assignmentCount.get(b.id) || 0);
    if (countDiff !== 0) return countDiff;
    return a.id - b.id;
  });

  return availableMembers[0];
}

export function normalizeBookingForm(form: CalendarRecord['booking_form']) {
  const parsed: any = typeof form === 'string' ? safeJsonParse<any>(form) : form || {};
  return {
    fields: Array.isArray(parsed.fields) ? parsed.fields : [],
  };
}

export function slugifyCalendarTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'calendar';
}

export function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
}

export function buildPublicCalendarUrl(slug: string) {
  return `${getFrontendBaseUrl()}/calendars/${slug}`;
}

export function buildEmbedUrl(slug: string) {
  return `${getFrontendBaseUrl()}/embed/${slug}`;
}

export function buildEmbedCode(slug: string) {
  const embedUrl = buildEmbedUrl(slug);
  return `<iframe src="${embedUrl}" style="border:0;width:100%;min-height:720px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}

export function buildMeetingUrl(bookingId: string) {
  const baseUrl = (process.env.MEETING_BASE_URL || getFrontendBaseUrl()).replace(/\/$/, '');
  return `${baseUrl}/meetings/${bookingId}`;
}

export function getWeekdayKey(dateString: string, timeZone: string) {
  const tz = safeTimezone(timeZone);
  const date = new Date(`${dateString}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' });
  const weekday = formatter.format(date).toLowerCase();
  return WEEKDAY_KEYS.includes(weekday as any) ? (weekday as typeof WEEKDAY_KEYS[number]) : 'monday';
}

export function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const tz = safeTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second || '0'),
  };
}

export function formatDateString(date: Date, timeZone: string) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

export function parseMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

export function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function buildUtcDateFromTimezoneDateTime(dateString: string, timeString: string, timeZone: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const zoneParts = getDatePartsInTimeZone(utcGuess, timeZone);
  const guessedUtc = Date.UTC(zoneParts.year, zoneParts.month - 1, zoneParts.day, zoneParts.hour, zoneParts.minute, zoneParts.second);
  const offsetMinutes = (guessedUtc - utcGuess.getTime()) / 60000;
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export function isDateWithinBookingWindow(dateString: string, timeZone: string, bookingWindowDays: number) {
  const todayString = formatDateString(new Date(), timeZone);
  const startOfToday = Date.UTC(...todayString.split('-').map(Number) as [number, number, number]);
  const targetDate = Date.UTC(...dateString.split('-').map(Number) as [number, number, number]);
  const diffDays = Math.floor((targetDate - startOfToday) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= bookingWindowDays;
}

export function normalizeBookingResponse(body: any = {}) {
  return body && typeof body === 'object' ? body : {};
}

export function formatReminderSchedule(slotEndAt: string, offsets: number[]) {
  const slotEnd = new Date(slotEndAt).getTime();
  return offsets
    .filter((offset) => Number.isFinite(offset))
    .map((minutesBefore) => ({
      minutesBefore,
      remindAt: new Date(slotEnd - minutesBefore * 60 * 1000).toISOString(),
    }))
    .sort((a, b) => b.minutesBefore - a.minutesBefore);
}

export function renderTemplate(template: string | null | undefined, values: Record<string, string>) {
  const source = template || '';
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, token) => values[token] ?? '');
}

export function generateCalendarSlots(params: {
  calendar: CalendarRecord;
  disabledSlots: DisabledSlotRecord[];
  holidays: HolidayRecord[];
  bookings: BookingRecord[];
  date: string;
}) {
  const { calendar, disabledSlots, holidays, bookings, date } = params;
  const settings = normalizeCalendarSettings(calendar.settings);
  const calendarType = normalizeCalendarType(settings.calendarType);
  const timezone = calendar.timezone;
  const dayKey = getWeekdayKey(date, timezone);
  const windows = settings.availability?.[dayKey] || [];

  const isHoliday = holidays.some((holiday) => holiday.holiday_date === date && holiday.is_full_day !== false);
  if (isHoliday) {
    return {
      date,
      timezone,
      status: 'holiday',
      slots: [] as Array<Record<string, any>>,
    };
  }

  const bookingWindowAllowed = isDateWithinBookingWindow(date, timezone, settings.bookingWindowDays);
  if (!bookingWindowAllowed) {
    return {
      date,
      timezone,
      status: 'outside_booking_window',
      slots: [] as Array<Record<string, any>>,
    };
  }

  const slots: Array<Record<string, any>> = [];
  const slotDuration = settings.slotDurationMinutes;
  const slotInterval = settings.slotIntervalMinutes || slotDuration;

  for (const window of windows) {
    const windowStart = parseMinutes(window.start);
    const windowEnd = parseMinutes(window.end);

    for (let cursor = windowStart; cursor + slotDuration <= windowEnd; cursor += slotInterval) {
      const startLocal = minutesToTime(cursor);
      const endLocal = minutesToTime(cursor + slotDuration);
      const startAt = buildUtcDateFromTimezoneDateTime(date, startLocal, timezone);
      const endAt = buildUtcDateFromTimezoneDateTime(date, endLocal, timezone);

      const overlapsDisabledSlot = disabledSlots.find((disabledSlot) => rangesOverlap(startAt, endAt, new Date(disabledSlot.start_at), new Date(disabledSlot.end_at)));
      const slotBookings = bookings.filter(
        (booking) => booking.status === 'confirmed' && rangesOverlap(startAt, endAt, new Date(booking.slot_start_at), new Date(booking.slot_end_at))
      );

      let status: 'available' | 'disabled' | 'booked' = 'available';
      let reason: string | undefined;

      const capacity = getSlotCapacity(settings);
      const roundRobinMembers = normalizeRoundRobinMembers(settings.roundRobinMembers);
      const availableRoundRobinMembers =
        calendarType === 'round_robin'
          ? roundRobinMembers.filter((member) =>
              isRoundRobinMemberAvailableForSlot(member, dayKey, startLocal, endLocal)
            )
          : [];
      const computedCapacity = calendarType === 'round_robin' ? availableRoundRobinMembers.length : capacity;
      const assignedUsers = calendarType === 'round_robin'
        ? new Set(slotBookings.map((booking) => booking.assigned_user_id).filter(Boolean))
        : new Set<number>();
      const usedCapacity = calendarType === 'round_robin'
        ? Math.max(slotBookings.length, assignedUsers.size)
        : slotBookings.length;
      const remainingCapacity = Math.max(0, computedCapacity - usedCapacity);

      if (overlapsDisabledSlot) {
        status = 'disabled';
        reason = overlapsDisabledSlot.reason || 'disabled_slot';
      } else if (remainingCapacity === 0) {
        status = 'booked';
        reason = 'already_booked';
      }

      slots.push({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        startLocal,
        endLocal,
        timezone,
        status,
        reason,
        capacity: computedCapacity,
        remainingCapacity,
        bookedCount: usedCapacity,
      });
    }
  }

  return {
    date,
    timezone,
    status: 'ok',
    slots,
  };
}

export function toApiCalendar(row: CalendarRecord) {
  const settings = normalizeCalendarSettings(row.settings);
  const bookingForm = normalizeBookingForm(row.booking_form);

  return {
    id: row.id,
    creatorId: String(row.creator_id),
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    timezone: row.timezone,
    confirmationMessage: row.confirmation_message || '',
    settings,
    bookingForm,
    shareUrl: buildPublicCalendarUrl(row.slug),
    embedUrl: buildEmbedUrl(row.slug),
    embedCode: buildEmbedCode(row.slug),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
  };
}
