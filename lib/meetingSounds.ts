export type MeetingSound = 'join' | 'leave' | 'request' | 'chat' | 'hand' |
  'recording-start' | 'recording-stop' | 'recording-pause' | 'recording-resume' |
  'connection-lost' | 'connection-restored' | 'meeting-end';

export const SOUND_ASSETS: Record<MeetingSound, string> = {
  join: '/sounds/participant-joined.wav', leave: '/sounds/participant-left.wav',
  request: '/sounds/join-request.wav', chat: '/sounds/chat-message.wav', hand: '/sounds/hand-raised.wav',
  'recording-start': '/sounds/recording-started.wav', 'recording-stop': '/sounds/recording-stopped.wav',
  'recording-pause': '/sounds/recording-paused.wav', 'recording-resume': '/sounds/recording-resumed.wav',
  'connection-lost': '/sounds/connection-lost.wav', 'connection-restored': '/sounds/connection-restored.wav',
  'meeting-end': '/sounds/meeting-ended.wav',
};
export const SOUND_LABELS: Record<MeetingSound, string> = {
  join: 'Participant joined', leave: 'Participant left', request: 'Waiting-room request',
  chat: 'New chat message', hand: 'Hand raised', 'recording-start': 'Recording started',
  'recording-stop': 'Recording stopped', 'recording-pause': 'Recording paused',
  'recording-resume': 'Recording resumed', 'connection-lost': 'Connection interrupted',
  'connection-restored': 'Connection restored', 'meeting-end': 'Meeting ended',
};

async function loadSoundAsset(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    // Revision query prevents stale audio when the compositions are changed.
    const response = await fetch(`${url}?v=1`, { signal: controller.signal, cache: 'force-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Notification audio unavailable');
    return await response.arrayBuffer();
  } finally { clearTimeout(timeout); }
}

// Lightweight fallback while original WAVs load, or if fetching/decoding fails.
export const SOUND_NOTES: Record<MeetingSound, readonly (readonly [number, number, number])[]> = {
  join: [[523.25, 0, .12], [659.25, .1, .18]],
  leave: [[587.33, 0, .12], [440, .12, .18]],
  request: [[659.25, 0, .14], [783.99, .19, .2]],
  chat: [[880, 0, .1], [1174.66, .06, .13]],
  hand: [[698.46, 0, .12], [880, .14, .16]],
  'recording-start': [[523.25, 0, .14], [659.25, .16, .14], [783.99, .32, .22]],
  'recording-stop': [[783.99, 0, .14], [659.25, .16, .14], [523.25, .32, .22]],
  'recording-pause': [[659.25, 0, .16], [659.25, .22, .16]],
  'recording-resume': [[659.25, 0, .14], [783.99, .17, .2]],
  'connection-lost': [[392, 0, .18], [329.63, .23, .22]],
  'connection-restored': [[440, 0, .12], [554.37, .14, .12], [659.25, .28, .18]],
  'meeting-end': [[659.25, 0, .15], [523.25, .17, .15], [392, .34, .22]],
};

export interface SoundPreferences { enabled: boolean; volume: number; joinLeave: boolean }
export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = { enabled: true, volume: 35, joinLeave: true };
export function parseSoundPreferences(value: unknown): SoundPreferences {
  const input = value && typeof value === 'object' ? value as Partial<SoundPreferences> : {};
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    joinLeave: typeof input.joinLeave === 'boolean' ? input.joinLeave : true,
    volume: typeof input.volume === 'number' && Number.isFinite(input.volume) ? Math.min(100, Math.max(0, input.volume)) : 35,
  };
}

export interface SoundSnapshot {
  approved: boolean; ready: boolean; moderator: boolean; selfId: string;
  participants: string[]; requests: string[]; hands: string[]; unread: number;
  interrupted: boolean; ended: boolean; recording: string;
}
const added = (before: string[], after: string[]) => after.some((id) => !before.includes(id));
export function getMeetingSounds(previous: SoundSnapshot | null, next: SoundSnapshot, preferences: SoundPreferences): MeetingSound[] {
  if (!previous || !preferences.enabled || preferences.volume <= 0) return [];
  if (next.ended && !previous.ended) return ['meeting-end'];
  if (!next.approved) return [];
  const sounds: MeetingSound[] = [];
  if (next.interrupted !== previous.interrupted && previous.approved) {
    sounds.push(next.interrupted ? 'connection-lost' : 'connection-restored');
  }
  // Ignore initial roster, reconnect snapshots, own hand/message and large-room churn.
  if (previous.approved && previous.ready && next.ready && !next.interrupted && !previous.interrupted) {
    if (preferences.joinLeave && Math.max(next.participants.length, previous.participants.length) < 10) {
      if (added(previous.participants, next.participants)) sounds.push('join');
      else if (added(next.participants, previous.participants)) sounds.push('leave');
    }
    if (next.unread > previous.unread) sounds.push('chat');
    if (next.moderator && previous.moderator) {
      if (added(previous.requests, next.requests)) sounds.push('request');
      if (added(previous.hands, next.hands.filter((id) => id !== next.selfId))) sounds.push('hand');
    }
  }
  if (next.recording !== previous.recording) {
    if (next.recording === 'recording') sounds.push(previous.recording === 'paused' ? 'recording-resume' : 'recording-start');
    else if (next.recording === 'paused') sounds.push('recording-pause');
    else if (['recording', 'paused'].includes(previous.recording)) sounds.push('recording-stop');
  }
  return sounds;
}

export class MeetingSoundPlayer {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private disposed = false;
  private lastGlobal = -Infinity;
  private last = new Map<MeetingSound, number>();
  private buffers = new Map<MeetingSound, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private playUntil = 0;
  constructor(private createContext: () => AudioContext, private loadAsset = loadSoundAsset) {}

  preload(): Promise<void> {
    const context = this.context;
    if (this.disposed || !context) return Promise.resolve();
    if (!this.loading) {
      this.loading = Promise.all(Object.entries(SOUND_ASSETS).map(async ([sound, url]) => {
        try {
          const data = await this.loadAsset(url);
          if (this.disposed || this.context !== context) return;
          const buffer = await context.decodeAudioData(data);
          if (!this.disposed && this.context === context) this.buffers.set(sound as MeetingSound, buffer);
        } catch { /* A failed asset must never interrupt the meeting; use synthesis. */ }
      })).then(() => {});
    }
    return this.loading;
  }

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.createContext();
        this.output = this.context.createGain();
        this.output.connect(this.context.destination);
        this.last.clear();
        this.lastGlobal = -Infinity;
        this.buffers.clear(); this.loading = null; this.playUntil = 0;
      }
      if (this.context.state !== 'running') await this.context.resume();
      if (this.disposed) return false;
      // Unlock iOS output from this gesture without an audible click.
      const silence = this.context.createBufferSource();
      silence.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      silence.connect(this.context.destination);
      silence.onended = () => silence.disconnect();
      silence.start();
      return this.context.state === 'running';
    } catch { return false; }
  }

  play(sound: MeetingSound, preferences: SoundPreferences): boolean {
    const context = this.context;
    if (this.disposed || !preferences.enabled || preferences.volume <= 0 || !context || context.state !== 'running' || !this.output) return false;
    const now = context.currentTime;
    const important = sound.startsWith('recording-') || sound === 'meeting-end';
    if (now - (this.last.get(sound) ?? -Infinity) < 1.5 || (!important && now - this.lastGlobal < .65)) return false;
    this.last.set(sound, now); this.lastGlobal = now;
    this.output.gain.setValueAtTime(Math.max(0, Math.min(100, preferences.volume)) / 100 * .16, now);
    const buffer = this.buffers.get(sound);
    if (buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.output);
      source.onended = () => source.disconnect();
      source.start(now);
      this.playUntil = Math.max(this.playUntil, now + buffer.duration);
      return true;
    }
    for (const [frequency, offset, duration] of SOUND_NOTES[sound]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, now + offset);
      envelope.gain.linearRampToValueAtTime(.7, now + offset + .015);
      envelope.gain.exponentialRampToValueAtTime(.001, now + offset + duration);
      oscillator.connect(envelope); envelope.connect(this.output);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now + offset); oscillator.stop(now + offset + duration + .02);
      this.playUntil = Math.max(this.playUntil, now + offset + duration + .02);
    }
    return true;
  }

  setVolume(preferences: SoundPreferences) {
    if (this.context && this.output) this.output.gain.setValueAtTime(preferences.enabled ? preferences.volume / 100 * .16 : 0, this.context.currentTime);
  }
  dispose() {
    this.disposed = true;
    const context = this.context;
    this.buffers.clear();
    // Let the actual file's release tail finish across route navigation.
    const tail = Math.min(2000, Math.max(650, ((this.playUntil - (context?.currentTime ?? 0)) * 1000) + 60));
    setTimeout(() => { void context?.close().catch(() => {}); }, tail);
  }
}
