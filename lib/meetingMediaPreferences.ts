'use client';

export interface MeetingMediaPreferences {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

function storageKey(roomId: string, userId: string) {
  return `tsmeet:media-preferences:${roomId}:${userId}`;
}

export function readMeetingMediaPreferences(roomId: string, userId: string): MeetingMediaPreferences | null {
  if (typeof window === 'undefined' || !roomId || !userId) return null;

  try {
    const raw = window.localStorage.getItem(storageKey(roomId, userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<MeetingMediaPreferences>;
    if (typeof value.cameraEnabled !== 'boolean' || typeof value.microphoneEnabled !== 'boolean') return null;
    return {
      cameraEnabled: value.cameraEnabled,
      microphoneEnabled: value.microphoneEnabled,
    };
  } catch {
    return null;
  }
}

export function writeMeetingMediaPreferences(
  roomId: string,
  userId: string,
  preferences: MeetingMediaPreferences,
) {
  if (typeof window === 'undefined' || !roomId || !userId) return;

  try {
    window.localStorage.setItem(storageKey(roomId, userId), JSON.stringify(preferences));
  } catch {
    // Storage may be disabled by the browser; media controls still work in memory.
  }
}
