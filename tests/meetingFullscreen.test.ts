import assert from 'node:assert/strict';
import test from 'node:test';
import { toggleMeetingFullscreen } from '../lib/meetingFullscreen';

test('enters fullscreen using the complete meeting root, including toolbar and overlays', async () => {
  let requested = 0;
  const root = { requestFullscreen: async () => { requested++; } };
  await toggleMeetingFullscreen(root, { fullscreenElement: null, exitFullscreen: async () => { assert.fail('Unexpected exit'); } });
  assert.equal(requested, 1);
});

test('exits existing fullscreen rather than nesting another request', async () => {
  let exited = false;
  await toggleMeetingFullscreen({ requestFullscreen: async () => { assert.fail('Unexpected enter'); } }, {
    fullscreenElement: {}, exitFullscreen: async () => { exited = true; },
  });
  assert.equal(exited, true);
});

test('unsupported fullscreen and missing root give an actionable failure', async () => {
  const document = { fullscreenElement: null, exitFullscreen: async () => {} };
  await assert.rejects(toggleMeetingFullscreen(null, document), /Fullscreen is unavailable/);
  await assert.rejects(toggleMeetingFullscreen({}, document), /Fullscreen is unavailable/);
});

test('browser denial propagates to the UI instead of claiming fullscreen succeeded', async () => {
  await assert.rejects(toggleMeetingFullscreen({ requestFullscreen: async () => { throw new Error('Denied'); } }, {
    fullscreenElement: null, exitFullscreen: async () => {},
  }), /Denied/);
});
