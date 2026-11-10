import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { mergeMeetingParticipants } from '../lib/meetingParticipants';
import { getSessionUser } from '../lib/browserSession';
import { setMicrophoneEnabledSafely } from '../lib/microphoneOperation';
import { GET as session } from '../app/api/auth/session/route';
import { POST as guest } from '../app/api/auth/guest/route';

test('admitted users remain visible before media connects, including camera/mic-off users', () => {
  const result = mergeMeetingParticipants([
    { socketId: 'self', userId: '1' },
    { socketId: 'guest', userId: '2', userData: { name: 'Safari Guest' } },
  ], [], '1');
  assert.equal(result.length + 1, 2);
  assert.equal(result[0].peerId, 'guest');
  assert.equal(result[0].name, 'Safari Guest');
  assert.equal(result[0].media, undefined);
});

test('signaling reconnect socket replaces identity mapping without double-counting media or recorders', () => {
  const result = mergeMeetingParticipants([
    { socketId: 'old', userId: '2' }, { socketId: 'new', userId: '2' },
  ], [ { identity: 'user:2', name: 'Member' }, { identity: 'EG_hidden_recorder' } ], '1');
  assert.equal(result.length, 1);
  assert.equal(result[0].peerId, 'new');
  assert.equal(result[0].name, 'Member');
});

test('media-only arrival is visible until signaling catches up; removed attendee disappears', () => {
  assert.equal(mergeMeetingParticipants([], [{ identity: 'user:2' }], '1').length, 1);
  assert.equal(mergeMeetingParticipants([], [], '1').length, 0);
});

const origin = 'https://meet.example.com';
test('microphone toggle awaits SDK mute/unmute before reporting completion', async () => {
  const calls: boolean[] = [];
  const participant = { setMicrophoneEnabled: async (enabled: boolean) => { calls.push(enabled); } };
  assert.equal(await setMicrophoneEnabledSafely(participant, true, () => true), true);
  assert.equal(await setMicrophoneEnabledSafely(participant, false, () => true), true);
  assert.deepEqual(calls, [true, false]);
});

for (const reason of ['host mute', 'meeting leave']) {
  test(`pending unmute is reversed when ${reason} happens during SDK capture`, async () => {
    let allowed = true;
    let finishCapture!: () => void;
    const calls: boolean[] = [];
    const capture = new Promise<void>((resolve) => { finishCapture = resolve; });
    const participant = { setMicrophoneEnabled: async (enabled: boolean) => {
      calls.push(enabled);
      if (enabled) await capture;
    } };
    const pending = setMicrophoneEnabledSafely(participant, true, () => allowed);
    assert.deepEqual(calls, [true]);
    allowed = false;
    finishCapture();
    assert.equal(await pending, false);
    assert.deepEqual(calls, [true, false]);
  });
}

test('microphone permission/SDK failures propagate rather than reporting success', async () => {
  const participant = { setMicrophoneEnabled: async () => { throw new Error('Permission denied'); } };
  await assert.rejects(setMicrophoneEnabledSafely(participant, true, () => true), /Permission denied/);
});

test('authoritative roster excludes pending users and stale media after leave or removal', () => {
  const admitted = [{ socketId: 'host', userId: '1' }, { socketId: 'guest', userId: '2' }];
  const media = [{ identity: 'user:2' }, { identity: 'user:3' }, { identity: 'EG_recorder' }];
  assert.equal(mergeMeetingParticipants(admitted, media, '1', true).length + 1, 2);
  assert.equal(mergeMeetingParticipants([admitted[0]], media, '1', true).length + 1, 1);
  assert.equal(mergeMeetingParticipants([], media, '1', true).length, 0);
});

test('three admitted clients agree on count without media, across reconnect and leave snapshots', () => {
  const members = [1, 2, 3].map((id) => ({ socketId: `socket-${id}`, userId: String(id) }));
  for (const self of members) {
    assert.equal(mergeMeetingParticipants(members, [], self.userId, true).length + 1, 3);
  }
  const reconnected = [members[0], { ...members[1], socketId: 'replacement-2' }, members[2]];
  const media = [{ identity: 'user:2' }, { identity: 'user:3' }];
  const roster = mergeMeetingParticipants(reconnected, media, '1', true);
  assert.equal(roster.length + 1, 3);
  assert.equal(roster.find((member) => member.userId === '2')?.peerId, 'replacement-2');
  assert.equal(mergeMeetingParticipants(reconnected.slice(0, 2), media, '1', true).length + 1, 2);
});

const roomId = '5ce29459-43e0-49d3-b050-d6d22092319e';

async function withBackend(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>, run: () => Promise<void>
) {
  const previousFetch = globalThis.fetch;
  const previousBackend = process.env.BACKEND_URL;
  process.env.BACKEND_URL = 'http://backend:3002';
  globalThis.fetch = (url, init) => Promise.resolve(respond(String(url), init));
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackend;
  }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const guestRequest = () => new NextRequest(`${origin}/api/auth/guest`, {
  method: 'POST', headers: { Cookie: 'tsmeet_session=private-fixture', 'Content-Type': 'application/json' },
  body: JSON.stringify({ roomId, name: 'New Guest' }),
});

test('account cookie restores identity without localStorage and never exposes JWT claims/token', async () => {
  await withBackend((url, init) => {
    assert.equal(url, 'http://backend:3002/api/auth/verify');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer private-fixture');
    assert.equal(init?.cache, 'no-store');
    return json({ valid: true, user: { userId: 7, name: 'Host', email: 'host@example.test', exp: 999 } });
  }, async () => {
    const result = await session(new NextRequest(`${origin}/api/auth/session`, {
      headers: { Cookie: 'tsmeet_session=private-fixture' },
    }));
    assert.equal(result.status, 200);
    assert.match(result.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(await result.json(), { user: { id: '7', name: 'Host', email: 'host@example.test', guest: false } });
    assert.equal(result.headers.get('set-cookie'), null);
  });
});

test('guest entry preserves a signed-in account cookie instead of overwriting it', async () => {
  let calls = 0;
  await withBackend((url) => {
    calls += 1;
    assert.match(url, /\/auth\/verify$/);
    return json({ valid: true, user: { userId: 7, name: 'Host' } });
  }, async () => {
    const result = await guest(guestRequest());
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal((await result.json()).user.id, '7');
    assert.equal(calls, 1);
  });
});

test('same-room guest identity survives refresh and does not require new host admission', async () => {
  await withBackend(() => json({ valid: true, user: { userId: 9, name: 'Guest', guest: true, roomId } }), async () => {
    const result = await guest(guestRequest());
    assert.equal(result.status, 200);
    assert.equal((await result.json()).user.id, '9');
    assert.equal(result.headers.get('set-cookie'), null);
  });
});

test('backend outage never replaces the account session or redirects the browser as expired', async () => {
  await withBackend(() => json({ error: 'Unavailable' }, 503), async () => {
    const result = await guest(guestRequest());
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('set-cookie'), null);
    await assert.rejects(getSessionUser(), /Unable to verify/);
  });
});

test('missing/expired sessions remain authentication failures', async () => {
  const noCookie = await session(new NextRequest(`${origin}/api/auth/session`));
  assert.equal(noCookie.status, 401);
  await withBackend(() => json({ error: 'Invalid or expired token' }, 403), async () => {
    const result = await session(new NextRequest(`${origin}/api/auth/session`, {
      headers: { Cookie: 'tsmeet_session=private-fixture' },
    }));
    assert.equal(result.status, 403);
    assert.equal(await getSessionUser(), null);
  });
});

test('anonymous guest still gets an HttpOnly session from the guest endpoint', async () => {
  await withBackend((url) => {
    assert.match(url, /\/auth\/guest$/);
    return json({ token: 'guest-fixture', user: { id: 12, name: 'New Guest', guest: true } }, 201);
  }, async () => {
    const result = await guest(new NextRequest(`${origin}/api/auth/guest`, {
      method: 'POST', body: JSON.stringify({ roomId, name: 'New Guest' }),
    }));
    assert.equal(result.status, 201);
    const cookie = result.headers.get('set-cookie') || '';
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Path=\//i);
    assert.equal((await result.json()).token, undefined);
  });
});
