import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import {
  BookingRecord,
  CalendarRecord,
  DisabledSlotRecord,
  HolidayRecord,
  buildMeetingUrl,
  buildPublicCalendarUrl,
  formatReminderSchedule,
  generateCalendarSlots,
  isValidTimezone,
  normalizeBookingResponse,
  normalizeCalendarSettings,
  renderTemplate,
  selectRoundRobinAssignee,
  slugifyCalendarTitle,
  toApiCalendar,
} from '../services/calendarService';

const router = Router();

function isCalendarOwner(calendar: CalendarRecord, userId?: string) {
  return String(calendar.creator_id) === String(userId);
}

async function getCalendarById(calendarId: string) {
  const result = await pool.query('SELECT * FROM calendars WHERE id = $1', [calendarId]);
  return result.rows[0] as CalendarRecord | undefined;
}

async function loadCalendarData(calendarId: string) {
  const [disabledSlots, holidays, bookings] = await Promise.all([
    pool.query('SELECT start_at, end_at, reason FROM calendar_disabled_slots WHERE calendar_id = $1 ORDER BY start_at ASC', [calendarId]),
    pool.query('SELECT holiday_date, label, is_full_day FROM calendar_holidays WHERE calendar_id = $1 ORDER BY holiday_date ASC', [calendarId]),
    pool.query('SELECT * FROM calendar_bookings WHERE calendar_id = $1 ORDER BY slot_start_at ASC', [calendarId]),
  ]);

  return {
    disabledSlots: disabledSlots.rows as DisabledSlotRecord[],
    holidays: holidays.rows as HolidayRecord[],
    bookings: bookings.rows as BookingRecord[],
  };
}

function normalizeMemberAvailabilityInput(value: any) {
  if (!value || typeof value !== 'object') return {};
  const output: Record<string, Array<{ start: string; end: string }>> = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const windows = Array.isArray((value as Record<string, any>)[day]) ? (value as Record<string, any>)[day] : [];
    output[day] = windows
      .map((window: any) => ({ start: String(window?.start || ''), end: String(window?.end || '') }))
      .filter((window: { start: string; end: string }) => /^\d{2}:\d{2}$/.test(window.start) && /^\d{2}:\d{2}$/.test(window.end));
  }
  return output;
}

async function resolveRoundRobinMembers(settings: any) {
  if (settings.calendarType !== 'round_robin') {
    return { ...settings, roundRobinMembers: [] };
  }

  const members = Array.isArray(settings.roundRobinMembers) ? settings.roundRobinMembers : [];
  const resolvedMembers: Array<{
    id: number;
    name?: string;
    email?: string;
    availability?: Record<string, Array<{ start: string; end: string }>>;
  }> = [];

  for (const rawMember of members) {
    const memberId = Number(rawMember?.id);
    const memberEmail = typeof rawMember?.email === 'string' ? rawMember.email.trim().toLowerCase() : '';
    const availability = normalizeMemberAvailabilityInput(rawMember?.availability);
    let result;

    if (Number.isFinite(memberId)) {
      result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [memberId]);
    } else if (memberEmail) {
      result = await pool.query('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1)', [memberEmail]);
    } else {
      return { error: 'Round-robin members must include a valid user ID or email.' };
    }

    if (!result || result.rows.length === 0) {
      return { error: `Round-robin member not found: ${memberEmail || rawMember?.id}` };
    }

    const user = result.rows[0];
    resolvedMembers.push({
      id: Number(user.id),
      name: String(user.name || ''),
      email: String(user.email || ''),
      availability,
    });
  }

  const deduped = Array.from(new Map(resolvedMembers.map((member) => [member.id, member])).values());
  return { ...settings, roundRobinMembers: deduped };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM calendars WHERE creator_id = $1 ORDER BY created_at DESC', [req.userId]);
    res.json(result.rows.map(toApiCalendar));
  } catch (error) {
    console.error('List calendars error:', error);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description = '',
      timezone = 'UTC',
      slug,
      confirmationMessage = '',
      settings = {},
      bookingForm = { fields: [] },
    } = req.body || {};

    if (!title || !timezone) {
      return res.status(400).json({ error: 'Missing required fields: title and timezone' });
    }

    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: `Invalid timezone: ${timezone}. Please use a valid IANA timezone (e.g. America/New_York, UTC).` });
    }

    const normalizedSettings = normalizeCalendarSettings(settings);
    const resolvedSettings = await resolveRoundRobinMembers(normalizedSettings);
    if ('error' in resolvedSettings) {
      return res.status(400).json({ error: resolvedSettings.error });
    }
    const baseSlug = slug ? slugifyCalendarTitle(String(slug)) : slugifyCalendarTitle(String(title));
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
    const calendarId = uuidv4();

    const result = await pool.query(
      `INSERT INTO calendars (
        id,
        creator_id,
        slug,
        title,
        description,
        timezone,
        confirmation_message,
        settings,
        booking_form
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
      RETURNING *`,
      [
        calendarId,
        req.userId,
        uniqueSlug,
        title,
        description,
        timezone,
        confirmationMessage,
        JSON.stringify(resolvedSettings),
        JSON.stringify(bookingForm || { fields: [] }),
      ]
    );

    res.status(201).json(toApiCalendar(result.rows[0] as CalendarRecord));
  } catch (error) {
    console.error('Create calendar error:', error);
    res.status(500).json({ error: 'Failed to create calendar' });
  }
});

router.get('/:calendarId', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (!isCalendarOwner(calendar, req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can view this calendar' });
    }

    const related = await loadCalendarData(calendar.id);
    res.json({
      ...toApiCalendar(calendar),
      disabledSlots: related.disabledSlots,
      holidays: related.holidays,
      bookings: related.bookings.map((booking) => ({
        id: booking.id,
        assignedUserId: booking.assigned_user_id,
        assignedUserName: booking.assigned_user_name,
        assignedUserEmail: booking.assigned_user_email,
        slotStartAt: booking.slot_start_at,
        slotEndAt: booking.slot_end_at,
        status: booking.status,
        bookerName: booking.booker_name,
        bookerEmail: booking.booker_email,
        responses: booking.responses,
        meetingUrl: booking.meeting_url,
        confirmationMessage: booking.confirmation_message,
        createdAt: booking.created_at,
        canceledAt: booking.canceled_at,
        cancelReason: booking.cancel_reason,
      })),
    });
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Failed to get calendar' });
  }
});

router.patch('/:calendarId', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (!isCalendarOwner(calendar, req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can update this calendar' });
    }

    const {
      title = calendar.title,
      description = calendar.description || '',
      timezone = calendar.timezone,
      confirmationMessage = calendar.confirmation_message || '',
      settings = normalizeCalendarSettings(calendar.settings),
      bookingForm = calendar.booking_form || { fields: [] },
    } = req.body || {};

    if (timezone && !isValidTimezone(timezone)) {
      return res.status(400).json({ error: `Invalid timezone: ${timezone}. Please use a valid IANA timezone (e.g. America/New_York, UTC).` });
    }

    const normalizedSettings = normalizeCalendarSettings(settings);
    const resolvedSettings = await resolveRoundRobinMembers(normalizedSettings);
    if ('error' in resolvedSettings) {
      return res.status(400).json({ error: resolvedSettings.error });
    }

    const result = await pool.query(
      `UPDATE calendars SET
        title = $1,
        description = $2,
        timezone = $3,
        confirmation_message = $4,
        settings = $5::jsonb,
        booking_form = $6::jsonb,
        updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
      [title, description, timezone, confirmationMessage, JSON.stringify(resolvedSettings), JSON.stringify(bookingForm), req.params.calendarId]
    );

    res.json(toApiCalendar(result.rows[0] as CalendarRecord));
  } catch (error) {
    console.error('Update calendar error:', error);
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

router.post('/:calendarId/disabled-slots', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (!isCalendarOwner(calendar, req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can modify disabled slots' });
    }

    const { startAt, endAt, reason = 'disabled_slot' } = req.body || {};
    if (!startAt || !endAt) {
      return res.status(400).json({ error: 'Missing required fields: startAt and endAt' });
    }

    const result = await pool.query(
      `INSERT INTO calendar_disabled_slots (calendar_id, start_at, end_at, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.calendarId, startAt, endAt, reason]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create disabled slot error:', error);
    res.status(500).json({ error: 'Failed to create disabled slot' });
  }
});

router.post('/:calendarId/holidays', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (!isCalendarOwner(calendar, req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can add holidays' });
    }

    const { holidayDate, label = '', isFullDay = true } = req.body || {};
    if (!holidayDate) {
      return res.status(400).json({ error: 'Missing required field: holidayDate' });
    }

    const result = await pool.query(
      `INSERT INTO calendar_holidays (calendar_id, holiday_date, label, is_full_day)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.calendarId, holidayDate, label, isFullDay]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create holiday error:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.get('/:calendarId/slots', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const date = String(req.query.date || '');
    if (!date) {
      return res.status(400).json({ error: 'Missing required query: date' });
    }

    const related = await loadCalendarData(calendar.id);
    const slots = generateCalendarSlots({
      calendar,
      disabledSlots: related.disabledSlots,
      holidays: related.holidays,
      bookings: related.bookings,
      date,
    });

    res.json({
      calendarId: calendar.id,
      slug: calendar.slug,
      ...slots,
    });
  } catch (error) {
    console.error('Generate calendar slots error:', error);
    res.status(500).json({ error: 'Failed to generate slots' });
  }
});

router.post('/:calendarId/bookings', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const settings = normalizeCalendarSettings(calendar.settings);
    const { slotStartAt, bookerName, bookerEmail = '', responses = {}, confirmationMessage } = req.body || {};
    if (!slotStartAt || !bookerName) {
      return res.status(400).json({ error: 'Missing required fields: slotStartAt and bookerName' });
    }

    const slotStart = new Date(slotStartAt);
    if (Number.isNaN(slotStart.getTime())) {
      return res.status(400).json({ error: 'Invalid slotStartAt' });
    }

    const slotEnd = new Date(slotStart.getTime() + settings.slotDurationMinutes * 60 * 1000);
    const date = slotStart.toISOString().slice(0, 10);
    const related = await loadCalendarData(calendar.id);
    const generated = generateCalendarSlots({
      calendar,
      disabledSlots: related.disabledSlots,
      holidays: related.holidays,
      bookings: related.bookings,
      date,
    });

    const matchingSlot = generated.slots.find((slot) => slot.startAt === slotStart.toISOString() && slot.status === 'available');
    if (!matchingSlot) {
      return res.status(409).json({ error: 'Selected slot is not available' });
    }

    const dailyBookingCount = related.bookings.filter((booking) => booking.status === 'confirmed' && booking.slot_start_at.slice(0, 10) === date).length;
    if (settings.dailySlotLimit > 0 && dailyBookingCount >= settings.dailySlotLimit) {
      return res.status(409).json({ error: 'Daily booking limit reached' });
    }

    const bookingId = uuidv4();
    const confirmation = confirmationMessage || calendar.confirmation_message || 'Your booking is confirmed.';
    const reminderOffsets = settings.reminderOffsetsMinutes || [10, 5, 1];
    const reminderSchedule = formatReminderSchedule(slotEnd.toISOString(), reminderOffsets);
    const meetingUrl = buildMeetingUrl(bookingId);
    const roundRobinAssignee = settings.calendarType === 'round_robin'
      ? selectRoundRobinAssignee(settings, related.bookings, slotStart.toISOString(), slotEnd.toISOString(), calendar.timezone)
      : null;

    const result = await pool.query(
      `INSERT INTO calendar_bookings (
        id,
        calendar_id,
        assigned_user_id,
        assigned_user_name,
        assigned_user_email,
        slot_start_at,
        slot_end_at,
        status,
        booker_name,
        booker_email,
        responses,
        meeting_url,
        meeting_provider,
        confirmation_message,
        reminder_offsets,
        reminder_schedule
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10::jsonb, $11, $12, $13, $14::jsonb, $15::jsonb)
      RETURNING *`,
      [
        bookingId,
        calendar.id,
        roundRobinAssignee?.id ?? null,
        roundRobinAssignee?.name ?? null,
        roundRobinAssignee?.email ?? null,
        slotStart.toISOString(),
        slotEnd.toISOString(),
        bookerName,
        bookerEmail,
        JSON.stringify(normalizeBookingResponse(responses)),
        meetingUrl,
        'generated-link',
        renderTemplate(confirmation, {
          bookerName: String(bookerName),
          calendarTitle: calendar.title,
          slotStartAt: slotStart.toISOString(),
          slotEndAt: slotEnd.toISOString(),
          meetingUrl,
          shareUrl: buildPublicCalendarUrl(calendar.slug),
        }),
        JSON.stringify(reminderOffsets),
        JSON.stringify(reminderSchedule),
      ]
    );

    res.status(201).json({
      booking: result.rows[0],
      meetingUrl,
      confirmationMessage: result.rows[0].confirmation_message,
      reminders: reminderSchedule,
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

router.get('/:calendarId/bookings', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarById(req.params.calendarId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (!isCalendarOwner(calendar, req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can view bookings' });
    }

    const { date, status } = req.query;
    const filters: string[] = ['calendar_id = $1'];
    const params: Array<string> = [calendar.id];

    if (date) {
      params.push(String(date));
      filters.push(`slot_start_at::date = $${params.length}::date`);
    }

    if (status) {
      params.push(String(status));
      filters.push(`status = $${params.length}`);
    }

    const result = await pool.query(`SELECT * FROM calendar_bookings WHERE ${filters.join(' AND ')} ORDER BY slot_start_at ASC`, params);
    res.json({
      calendarId: calendar.id,
      count: result.rows.length,
      bookings: result.rows,
    });
  } catch (error) {
    console.error('List bookings error:', error);
    res.status(500).json({ error: 'Failed to list bookings' });
  }
});

export default router;
