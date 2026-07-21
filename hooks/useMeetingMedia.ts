'use client';

import { useLiveKitRoom } from './useLiveKitRoom';
import { useWebRTC } from './useWebRTC';

export type MeetingMediaProvider = 'mesh' | 'livekit' | null;

export function useMeetingMedia(
  provider: MeetingMediaProvider,
  roomId: string,
  userId: string,
  config: {
    signalingServer: string;
    userName?: string;
    pinnedParticipantId?: string | null;
    activeSpeakerId?: string | null;
  }
) {
  const livekit = useLiveKitRoom(roomId, userId, {
    ...config,
    enabled: provider === 'livekit',
  });
  const mesh = useWebRTC(roomId, userId, {
    signalingServer: config.signalingServer,
    userName: config.userName,
    enabled: provider === 'mesh',
  });

  return provider === 'mesh' ? mesh : livekit;
}
