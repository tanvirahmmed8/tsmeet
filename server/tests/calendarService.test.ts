import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRecurringSlotStarts,
  isValidTimezone,
  normalizeCalendarSettings,
  normalizeRecurrence,
  slugifyCalendarTitle,
} from '../services/calendarService';

test('calendar slugs are URL safe', () => {
  assert.equal(slugifyCalendarTitle(' Product Demo & Review '), 'product-demo-review');
});

test('calendar settings enforce safe defaults', () => {
  const settings = normalizeCalendarSettings({ slotDurationMinutes: -1, bookingWindowDays: 0 });
  assert.ok(settings.slotDurationMinutes > 0);
  assert.ok(settings.bookingWindowDays > 0);
  assert.equal(settings.recurringBookingsEnabled, false);
  assert.equal(settings.maxRecurringBookings, 12);
});

test('recurrence input is bounded and rejects invalid series', () => {
  assert.deepEqual(normalizeRecurrence({ frequency: 'weekly', interval: 2, count: 20 }, 6), {
    frequency: 'weekly',
    interval: 2,
    count: 6,
  });
  assert.equal(normalizeRecurrence({ frequency: 'monthly', count: 3 }), null);
  assert.equal(normalizeRecurrence({ frequency: 'daily', count: 1 }), null);
});

test('recurring starts preserve local time across a timezone offset', () => {
  const starts = buildRecurringSlotStarts(
    '2026-03-01T03:00:00.000Z',
    { frequency: 'weekly', interval: 1, count: 3 },
    'Asia/Dhaka'
  );
  assert.equal(starts.length, 3);
  assert.deepEqual(
    starts.map((value) => value.toISOString()),
    ['2026-03-01T03:00:00.000Z', '2026-03-08T03:00:00.000Z', '2026-03-15T03:00:00.000Z']
  );
});

test('IANA timezones are validated', () => {
  assert.equal(isValidTimezone('Asia/Dhaka'), true);
  assert.equal(isValidTimezone('Not/A_Timezone'), false);
});
