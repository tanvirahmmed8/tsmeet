import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTimezone, normalizeCalendarSettings, slugifyCalendarTitle } from '../services/calendarService';

test('calendar slugs are URL safe', () => {
  assert.equal(slugifyCalendarTitle(' Product Demo & Review '), 'product-demo-review');
});

test('calendar settings enforce safe defaults', () => {
  const settings = normalizeCalendarSettings({ slotDurationMinutes: -1, bookingWindowDays: 0 });
  assert.ok(settings.slotDurationMinutes > 0);
  assert.ok(settings.bookingWindowDays > 0);
});

test('IANA timezones are validated', () => {
  assert.equal(isValidTimezone('Asia/Dhaka'), true);
  assert.equal(isValidTimezone('Not/A_Timezone'), false);
});
