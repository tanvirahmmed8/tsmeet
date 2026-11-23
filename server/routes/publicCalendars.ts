import { Router, Response } from 'express';
import type { NamedRouteRequest as Request } from '../types/namedRouteRequest';
import { v4 as uuidv4 } from 'uuid';
import { acquireBookingLock, pool } from '../db';
import {
  CalendarRecord,
  BookingRecord,
  buildEmbedCode,
  buildEmbedUrl,
  buildPublicCalendarUrl,
  buildMeetingUrl,
  buildRecurringSlotStarts,
  formatReminderSchedule,
  formatDateString,
  generateCalendarSlots,
  normalizeBookingResponse,
  normalizeBookingForm,
  normalizeCalendarSettings,
  normalizeRecurrence,
  renderTemplate,
  selectRoundRobinAssignee,
  toApiCalendar,
} from '../services/calendarService';

const router = Router();

async function getCalendarBySlug(slug: string) {
  const result = await pool.query('SELECT * FROM calendars WHERE slug = $1', [slug]);
  return result.rows[0] as CalendarRecord | undefined;
}

async function loadCalendarData(calendarId: string) {
  const [disabledSlots, holidays, bookings] = await Promise.all([
    pool.query('SELECT start_at, end_at, reason FROM calendar_disabled_slots WHERE calendar_id = $1 ORDER BY start_at ASC', [calendarId]),
    pool.query('SELECT holiday_date, label, is_full_day FROM calendar_holidays WHERE calendar_id = $1 ORDER BY holiday_date ASC', [calendarId]),
    pool.query('SELECT * FROM calendar_bookings WHERE calendar_id = $1 ORDER BY slot_start_at ASC', [calendarId]),
  ]);

  return {
    disabledSlots: disabledSlots.rows,
    holidays: holidays.rows,
    bookings: bookings.rows as BookingRecord[],
  };
}

router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarBySlug(req.params.slug);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const settings = normalizeCalendarSettings(calendar.settings);
    const bookingForm = normalizeBookingForm(calendar.booking_form);

    res.json({
      ...toApiCalendar(calendar),
      settings,
      bookingForm,
      shareUrl: buildPublicCalendarUrl(calendar.slug),
      embedUrl: buildEmbedUrl(calendar.slug),
      embedCode: buildEmbedCode(calendar.slug),
    });
  } catch (error) {
    console.error('Get public calendar error:', error);
    res.status(500).json({ error: 'Failed to get public calendar' });
  }
});

router.get('/:slug/slots', async (req: Request, res: Response) => {
  try {
    const calendar = await getCalendarBySlug(req.params.slug);
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
    console.error('Get public slots error:', error);
    res.status(500).json({ error: 'Failed to get slots' });
  }
});

router.post('/:slug/bookings', async (req: Request, res: Response) => {
  let releaseBookingLock: (() => Promise<void>) | null = null;
  try {
    const calendar = await getCalendarBySlug(req.params.slug);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    releaseBookingLock = await acquireBookingLock(calendar.id);
    if (!releaseBookingLock) {
      return res.status(503).json({ error: 'Booking service is busy. Please retry.' });
    }

    const settings = normalizeCalendarSettings(calendar.settings);
    const {
      slotStartAt,
      bookerName,
      bookerEmail = '',
      responses = {},
      confirmationMessage,
      recurrence,
    } = req.body || {};
    if (!slotStartAt || !bookerName) {
      return res.status(400).json({ error: 'Missing required fields: slotStartAt and bookerName' });
    }

    const requestedRecurrence = normalizeRecurrence(recurrence, settings.maxRecurringBookings);
    if (recurrence && !settings.recurringBookingsEnabled) {
      return res.status(400).json({ error: 'Recurring bookings are not enabled for this calendar' });
    }
    if (recurrence && !requestedRecurrence) {
      return res.status(400).json({ error: 'Invalid recurrence. Use daily or weekly frequency and a count from 2 to 12.' });
    }

    const slotStarts = buildRecurringSlotStarts(slotStartAt, requestedRecurrence, calendar.timezone);
    if (slotStarts.length === 0) {
      return res.status(400).json({ error: 'Invalid slotStartAt' });
    }

    const related = await loadCalendarData(calendar.id);
    const plannedBookings: BookingRecord[] = [];
    const slotPlans: Array<{ slotStart: Date; slotEnd: Date; assignee: ReturnType<typeof selectRoundRobinAssignee> }> = [];
    for (const slotStart of slotStarts) {
      const slotEnd = new Date(slotStart.getTime() + settings.slotDurationMinutes * 60 * 1000);
      const date = formatDateString(slotStart, calendar.timezone);
      const bookingsForCheck = [...related.bookings, ...plannedBookings];
      const generated = generateCalendarSlots({
        calendar,
        disabledSlots: related.disabledSlots,
        holidays: related.holidays,
        bookings: bookingsForCheck,
        date,
      });
      const matchingSlot = generated.slots.find((slot) => slot.startAt === slotStart.toISOString() && slot.status === 'available');
      if (!matchingSlot) {
        return res.status(409).json({ error: `Selected recurring slot is not available: ${slotStart.toISOString()}` });
      }

      const dailyBookingCount = bookingsForCheck.filter(
        (booking: BookingRecord) => booking.status === 'confirmed' && formatDateString(new Date(booking.slot_start_at), calendar.timezone) === date
      ).length;
      if (settings.dailySlotLimit > 0 && dailyBookingCount >= settings.dailySlotLimit) {
        return res.status(409).json({ error: `Daily booking limit reached for ${date}` });
      }

      const assignee = settings.calendarType === 'round_robin'
        ? selectRoundRobinAssignee(settings, bookingsForCheck, slotStart.toISOString(), slotEnd.toISOString(), calendar.timezone)
        : null;
      if (settings.calendarType === 'round_robin' && !assignee) {
        return res.status(409).json({ error: `No round-robin member is available for ${slotStart.toISOString()}` });
      }
      slotPlans.push({ slotStart, slotEnd, assignee });
      plannedBookings.push({
        id: `planned-${slotStart.toISOString()}`,
        calendar_id: calendar.id,
        slot_start_at: slotStart.toISOString(),
        slot_end_at: slotEnd.toISOString(),
        status: 'confirmed',
        booker_name: String(bookerName),
      });
    }

    const confirmation = confirmationMessage || calendar.confirmation_message || 'Your booking is confirmed.';
    const reminderOffsets = settings.reminderOffsetsMinutes || [10, 5, 1];
    const seriesId = requestedRecurrence ? uuidv4() : null;
    const bookings: any[] = [];
    const insertedBookingIds: string[] = [];
    try {
      for (const [index, plan] of slotPlans.entries()) {
        const bookingId = uuidv4();
        const meetingUrl = buildMeetingUrl(bookingId);
        const reminderSchedule = formatReminderSchedule(plan.slotEnd.toISOString(), reminderOffsets);
        const result = await pool.query(
      `INSERT INTO calendar_bookings (
        id,
        calendar_id,
        series_id,
        series_index,
        recurrence,
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
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, 'confirmed', $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, $18::jsonb)
      RETURNING *`,
      [
        bookingId,
        calendar.id,
        seriesId,
        requestedRecurrence ? index : null,
        requestedRecurrence ? JSON.stringify(requestedRecurrence) : null,
        plan.assignee?.id ?? null,
        plan.assignee?.name ?? null,
        plan.assignee?.email ?? null,
        plan.slotStart.toISOString(),
        plan.slotEnd.toISOString(),
        bookerName,
        bookerEmail,
        JSON.stringify(normalizeBookingResponse(responses)),
        meetingUrl,
        'generated-link',
        renderTemplate(confirmation, {
          bookerName: String(bookerName),
          calendarTitle: calendar.title,
          slotStartAt: plan.slotStart.toISOString(),
          slotEndAt: plan.slotEnd.toISOString(),
          meetingUrl,
          shareUrl: buildPublicCalendarUrl(calendar.slug),
        }),
        JSON.stringify(reminderOffsets),
        JSON.stringify(reminderSchedule),
      ]
        );
        insertedBookingIds.push(bookingId);
        bookings.push(result.rows[0]);
      }
    } catch (error) {
      if (insertedBookingIds.length > 0) {
        const placeholders = insertedBookingIds.map((_id, index) => `$${index + 1}`).join(', ');
        await pool.query(`DELETE FROM calendar_bookings WHERE id IN (${placeholders})`, insertedBookingIds).catch((cleanupError) => {
          console.error('Failed to roll back recurring booking series:', cleanupError);
        });
      }
      throw error;
    }

    res.status(201).json({
      booking: bookings[0],
      bookings,
      meetingUrl: bookings[0]?.meeting_url,
      meetingUrls: bookings.map((booking) => booking.meeting_url),
      seriesId,
      confirmationMessage: bookings[0]?.confirmation_message,
      reminders: formatReminderSchedule(slotPlans[0].slotEnd.toISOString(), reminderOffsets),
    });
  } catch (error) {
    console.error('Create public booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    await releaseBookingLock?.();
  }
});

// Public meeting lookup — used by /meetings/[bookingId] page (no auth required)
router.get('/meetings/:bookingId', async (req: Request, res: Response) => {
  try {
    const bookingResult = await pool.query('SELECT * FROM calendar_bookings WHERE id = $1', [req.params.bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0] as BookingRecord;
    const calendarResult = await pool.query('SELECT id, title, timezone, slug, settings FROM calendars WHERE id = $1', [booking.calendar_id]);
    const calendar = calendarResult.rows[0];
    const calendarSettings = calendar ? normalizeCalendarSettings(calendar.settings) : null;

    res.json({
      booking: {
        id: booking.id,
        status: booking.status,
        slotStartAt: booking.slot_start_at,
        slotEndAt: booking.slot_end_at,
        bookerName: booking.booker_name,
        meetingUrl: booking.meeting_url,
        confirmationMessage: booking.confirmation_message,
        canceledAt: booking.canceled_at,
        cancelReason: booking.cancel_reason,
      },
      calendar: calendar ? {
        id: calendar.id,
        title: calendar.title,
        timezone: calendar.timezone,
        slug: calendar.slug,
        settings: {
          autoRecordMeeting: Boolean(calendarSettings?.autoRecordMeeting),
          calendarType: calendarSettings?.calendarType || 'personal',
        },
      } : null,
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ error: 'Failed to get meeting details' });
  }
});

export default router;
