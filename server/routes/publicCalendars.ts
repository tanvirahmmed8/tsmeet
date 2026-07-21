import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { acquireBookingLock, pool } from '../db';
import {
  CalendarRecord,
  BookingRecord,
  buildEmbedCode,
  buildEmbedUrl,
  buildPublicCalendarUrl,
  buildMeetingUrl,
  formatReminderSchedule,
  generateCalendarSlots,
  normalizeBookingResponse,
  normalizeBookingForm,
  normalizeCalendarSettings,
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

    const dailyBookingCount = related.bookings.filter(
      (booking: BookingRecord) => booking.status === 'confirmed' && booking.slot_start_at.slice(0, 10) === date
    ).length;
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
