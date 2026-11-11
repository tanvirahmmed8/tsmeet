'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type RecordingNotice = { id: string; status: string } | null;

// Observe the existing socket; never create another connection or change admission.
export function useMeetingSignals(roomId: string) {
  const [signalingInterrupted, setSignalingInterrupted] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState<RecordingNotice>(null);
  const [rosterReady, setRosterReady] = useState(false);
  useEffect(() => {
    setSignalingInterrupted(false);
    setRecordingNotice(null);
    setRosterReady(false);
  }, [roomId]);

  const bindMeetingSignals = useCallback((socket: Socket) => {
    setSignalingInterrupted(false);
    setRecordingNotice(null);
    setRosterReady(false);
    let connected = false;
    socket.on('connect', () => { connected = true; setSignalingInterrupted(false); });
    socket.on('disconnect', (reason) => {
      if (connected && reason !== 'io client disconnect') setSignalingInterrupted(true);
    });
    socket.on('connect_error', () => { if (connected) setSignalingInterrupted(true); });
    socket.on('room-participants', () => setRosterReady(true));
    socket.on('visible-participants-updated', () => setRosterReady(true));
    socket.on('recording-session-updated', (session: unknown) => {
      if (session === null) { setRecordingNotice(null); return; }
      if (!session || typeof session !== 'object') return;
      const value = session as Record<string, unknown>;
      if (value.roomId !== roomId || typeof value.id !== 'string' || typeof value.status !== 'string') return;
      if (!['awaiting_recorder', 'recording', 'paused', 'stopping', 'completed', 'failed'].includes(value.status)) return;
      setRecordingNotice({ id: value.id, status: value.status });
    });
  }, [roomId]);
  return { bindMeetingSignals, signalingInterrupted, recordingNotice, rosterReady };
}
