'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, ConnectionState, type Room } from 'livekit-client';
import { DEFAULT_SOUND_PREFERENCES, getMeetingSounds, MeetingSoundPlayer, parseSoundPreferences, type MeetingSound, type SoundPreferences, type SoundSnapshot } from '@/lib/meetingSounds';

const STORAGE_KEY = 'tsmeet.notification-sounds.v1';

export function useMeetingSounds(roomId: string, snapshot: SoundSnapshot, room?: Room) {
  const [preferences, setPreferences] = useState(DEFAULT_SOUND_PREFERENCES);
  const [unlocked, setUnlocked] = useState(false);
  const [mediaInterrupted, setMediaInterrupted] = useState(false);
  const player = useRef<MeetingSoundPlayer | null>(null);
  const previous = useRef<SoundSnapshot | null>(null);
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    let saved = DEFAULT_SOUND_PREFERENCES;
    try { saved = parseSoundPreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { /* Storage is optional, including private mode. */ }
    preferencesRef.current = saved;
    setPreferences(saved);
    setUnlocked(false);
    previous.current = null;
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const instance = new MeetingSoundPlayer(() => new AudioContextClass());
    player.current = instance;
    let active = true;
    const unlock = () => {
      if (!preferencesRef.current.enabled) return;
      void instance.unlock().then((ready) => {
        if (active) setUnlocked(ready);
        if (ready) void instance.preload();
      });
    };
    // Keep listeners: iOS may suspend output again after switching apps.
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      active = false;
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      instance.dispose();
      if (player.current === instance) player.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    if (!room) { setMediaInterrupted(false); return; }
    const changed = (state: ConnectionState) => {
      setMediaInterrupted(state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting || state === ConnectionState.Disconnected);
    };
    room.on(RoomEvent.ConnectionStateChanged, changed);
    return () => { room.off(RoomEvent.ConnectionStateChanged, changed); };
  }, [room]);

  useEffect(() => {
    const next = { ...snapshot, interrupted: snapshot.interrupted || mediaInterrupted };
    const sounds = getMeetingSounds(previous.current, next, preferences);
    previous.current = next;
    // Choose the most important simultaneous notification instead of overlapping tones.
    const selected = sounds.find((sound) => sound === 'meeting-end' || sound.startsWith('recording-'))
      ?? sounds.find((sound) => sound.startsWith('connection-'))
      ?? sounds.find((sound) => sound === 'request' || sound === 'hand' || sound === 'chat')
      ?? sounds[0];
    if (selected) player.current?.play(selected, preferences);
  }, [snapshot, mediaInterrupted, preferences]);

  const updatePreferences = useCallback((patch: Partial<SoundPreferences>) => {
    const next = parseSoundPreferences({ ...preferencesRef.current, ...patch });
    preferencesRef.current = next;
    setPreferences(next);
    player.current?.setVolume(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Preferences still work in memory. */ }
  }, []);

  const testSound = useCallback(async (sound: MeetingSound = 'chat') => {
    const instance = player.current;
    if (!instance) return;
    const ready = await instance.unlock();
    setUnlocked(ready);
    if (ready) {
      await instance.preload();
      instance.play(sound, preferencesRef.current);
    }
  }, []);

  return { preferences, updatePreferences, unlocked, testSound };
}
