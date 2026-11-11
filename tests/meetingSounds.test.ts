import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_SOUND_PREFERENCES as preferences, getMeetingSounds, MeetingSoundPlayer, parseSoundPreferences, SOUND_ASSETS, SOUND_NOTES, type SoundSnapshot } from '../lib/meetingSounds';

const snapshot = (patch: Partial<SoundSnapshot> = {}): SoundSnapshot => ({
  approved: true, ready: true, moderator: true, selfId: 'self', participants: ['other'],
  requests: [], hands: [], unread: 0, interrupted: false, ended: false, recording: 'idle', ...patch,
});

test('notification policy ignores initial lists, self actions, reorder, muted and large-room churn', () => {
  assert.deepEqual(getMeetingSounds(null, snapshot(), preferences), []);
  assert.deepEqual(getMeetingSounds(snapshot({ ready: false }), snapshot({ participants: ['other', 'new'] }), preferences), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ hands: ['self'] }), preferences), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot(), preferences), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ unread: 1 }), { ...preferences, enabled: false }), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ unread: 1 }), { ...preferences, volume: 0 }), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ participants: Array.from({ length: 10 }, (_, i) => String(i)) }), preferences), []);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ participants: ['other', 'new'] }), { ...preferences, joinLeave: false }), []);
});

test('notification policy covers join, leave, unread chat, moderator requests and raised hands', () => {
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ participants: ['other', 'new'] }), preferences), ['join']);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ participants: [] }), preferences), ['leave']);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ unread: 3 }), preferences), ['chat']);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ requests: ['guest'], hands: ['other'] }), preferences), ['request', 'hand']);
  assert.deepEqual(getMeetingSounds(snapshot({ moderator: false }), snapshot({ moderator: false, requests: ['guest'], hands: ['other'] }), preferences), []);
});

test('connection transitions suppress roster replay and meeting end takes priority', () => {
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ interrupted: true, participants: [] }), preferences), ['connection-lost']);
  assert.deepEqual(getMeetingSounds(snapshot({ interrupted: true }), snapshot({ participants: ['other', 'new'] }), preferences), ['connection-restored']);
  assert.deepEqual(getMeetingSounds(snapshot(), snapshot({ approved: false, ended: true, participants: [] }), preferences), ['meeting-end']);
  assert.deepEqual(getMeetingSounds(snapshot({ ended: true }), snapshot({ approved: false, ended: true }), preferences), []);
});

test('recording start, pause, resume and terminal updates have distinct sounds for attendees too', () => {
  assert.deepEqual(getMeetingSounds(snapshot({ moderator: false }), snapshot({ moderator: false, recording: 'recording' }), preferences), ['recording-start']);
  assert.deepEqual(getMeetingSounds(snapshot({ recording: 'recording' }), snapshot({ recording: 'paused' }), preferences), ['recording-pause']);
  assert.deepEqual(getMeetingSounds(snapshot({ recording: 'paused' }), snapshot({ recording: 'recording' }), preferences), ['recording-resume']);
  for (const recording of ['stopping', 'completed', 'failed', 'idle']) {
    assert.deepEqual(getMeetingSounds(snapshot({ recording: 'recording' }), snapshot({ recording }), preferences), ['recording-stop']);
  }
  assert.deepEqual(getMeetingSounds(snapshot({ recording: 'recording' }), snapshot({ recording: 'recording' }), preferences), []);
});

test('notification preferences tolerate malformed storage and clamp volume', () => {
  assert.deepEqual(parseSoundPreferences(null), preferences);
  assert.deepEqual(parseSoundPreferences({ volume: NaN, enabled: 'yes' }), preferences);
  assert.equal(parseSoundPreferences({ volume: 200 }).volume, 100);
  assert.equal(parseSoundPreferences({ volume: -1 }).volume, 0);
});

function fakeAudio() {
  const buffer = { duration: .4 } as AudioBuffer;
  const sources: Array<{ buffer: unknown }> = [];
  const oscillators: Array<{ frequency: { value: number }; startTime?: number; stopTime?: number }> = [];
  let closed = false;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const context = {
    state: 'suspended', currentTime: 0, sampleRate: 48000, destination: {},
    async resume() { context.state = 'running'; },
    async close() { closed = true; context.state = 'closed'; },
    createBuffer() { return {}; },
    async decodeAudioData() { return buffer; },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() {}, buffer: null as unknown, onended: null };
      sources.push(source); return source;
    },
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; },
    createOscillator() {
      const oscillator = {
        type: 'sine', frequency: { value: 0 }, onended: null,
        connect() {}, disconnect() {}, start(time: number) { oscillator.startTime = time; }, stop(time: number) { oscillator.stopTime = time; },
        startTime: undefined as number | undefined, stopTime: undefined as number | undefined,
      };
      oscillators.push(oscillator); return oscillator;
    },
  };
  return { context, buffer, sources, oscillators, closed: () => closed, factory: () => context as unknown as AudioContext };
}

test('player unlocks only on request, drops blocked events, rate limits and cleans up', async () => {
  const audio = fakeAudio();
  const player = new MeetingSoundPlayer(audio.factory);
  assert.equal(player.play('chat', preferences), false);
  assert.equal(audio.oscillators.length, 0);
  assert.equal(await player.unlock(), true);
  assert.equal(audio.oscillators.length, 0); // No queued chime replay after unlock.
  assert.equal(player.play('chat', preferences), true);
  assert.equal(audio.oscillators.length, SOUND_NOTES.chat.length);
  assert.equal(player.play('chat', preferences), false);
  assert.equal(player.play('join', preferences), false);
  audio.context.currentTime = 2;
  assert.equal(player.play('join', preferences), true);
  assert.equal(player.play('meeting-end', preferences), true); // Important alert is not lost to ordinary cooldown.
  assert.equal(player.play('leave', { ...preferences, enabled: false }), false);
  audio.context.state = 'suspended';
  assert.equal(player.play('chat', preferences), false);
  player.dispose();
  assert.equal(player.play('chat', preferences), false);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(audio.closed(), true);
});

test('autoplay rejection is handled without throwing or queuing old alerts', async () => {
  const audio = fakeAudio();
  audio.context.resume = async () => { throw new Error('NotAllowedError'); };
  const player = new MeetingSoundPlayer(audio.factory);
  assert.equal(await player.unlock(), false);
  assert.equal(player.play('chat', preferences), false);
  player.dispose();
});

test('original assets are distinct, short stereo PCM files with headroom and silent endpoints', () => {
  const hashes = new Set<string>();
  for (const url of Object.values(SOUND_ASSETS)) {
    assert.match(url, /^\/sounds\/[a-z-]+\.wav$/);
    const wav = readFileSync(`public${url}`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.ok((wav.length - 44) / (44100 * 4) < 1.1);
    assert.equal(wav.readInt32LE(44), 0);
    assert.equal(wav.readInt32LE(wav.length - 4), 0);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 32767 * .65);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
  }
  assert.equal(hashes.size, 12);
});

test('decoded original files take precedence, load once and keep volume/cooldown controls', async () => {
  const audio = fakeAudio();
  const requests: string[] = [];
  const player = new MeetingSoundPlayer(audio.factory, async (url) => { requests.push(url); return new ArrayBuffer(8); });
  await player.unlock();
  await Promise.all([player.preload(), player.preload()]);
  assert.equal(requests.length, 12);
  assert.equal(player.play('chat', preferences), true);
  assert.equal(audio.sources.at(-1)?.buffer, audio.buffer);
  assert.equal(audio.oscillators.length, 0);
  assert.equal(player.play('chat', preferences), false);
  audio.context.currentTime = 3;
  assert.equal(player.play('join', { ...preferences, enabled: false }), false);
  player.dispose();
});

test('missing or undecodable files fall back to synthesis without delaying an event', async () => {
  for (const decodeFailure of [false, true]) {
    const audio = fakeAudio();
    if (decodeFailure) audio.context.decodeAudioData = async () => { throw new Error('Invalid WAV'); };
    const player = new MeetingSoundPlayer(audio.factory, async () => {
      if (!decodeFailure) throw new Error('Offline');
      return new ArrayBuffer(8);
    });
    await player.unlock();
    await player.preload();
    assert.equal(player.play('chat', preferences), true);
    assert.equal(audio.oscillators.length, SOUND_NOTES.chat.length);
    player.dispose();
  }
});
