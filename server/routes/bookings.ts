import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { CalendarRecord, BookingRecord } from '../services/calendarService';

const router = Router();

async function getCalendarById(calendarId: string) {
  const result = await pool.query('SELECT * FROM calendars WHERE id = $1', [calendarId]);
  return result.rows[0] as CalendarRecord | undefined;
}

router.post('/:bookingId/cancel', async (req: Request, res: Response) => {
  try {
    const bookingResult = await pool.query('SELECT * FROM calendar_bookings WHERE id = $1', [req.params.bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0] as BookingRecord;
    const calendar = await getCalendarById(booking.calendar_id);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    if (String(calendar.creator_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only calendar creator can cancel bookings' });
    }

    const { cancelReason = 'Canceled by creator' } = req.body || {};
    const result = await pool.query(
      `UPDATE calendar_bookings
       SET status = 'canceled', canceled_at = NOW(), cancel_reason = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [cancelReason, req.params.bookingId]
    );

    res.json({ booking: result.rows[0] });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

export default router;
