'use client';

import { RoomAudioRenderer, RoomContext, StartAudio, VideoTrack } from '@livekit/components-react';
import { Track, type Room } from 'livekit-client';
import { useContext, useEffect, useRef, type ReactNode } from 'react';

// Reuse the hook-owned room: this provider never connects or captures media.
export function MeetingMediaProvider({ room, children }: { room?: Room; children: ReactNode }) {
  return <RoomContext.Provider value={room}>
    {children}
  </RoomContext.Provider>;
}

export function MeetingPlayback() {
  const room = useContext(RoomContext);
  return room ? <>
    <RoomAudioRenderer room={room} />
    <StartAudio label="Enable meeting audio" className="fixed left-4 top-4 z-40 rounded-xl bg-teal-700 px-4 py-2 text-white" />
  </> : null;
}

export function MeetingVideo({ userId, screen = false, stream, className }: {
  userId?: string; screen?: boolean; stream?: MediaStream | null; className?: string;
}) {
  const room = useContext(RoomContext);
  const participant = userId ? room?.getParticipantByIdentity(`user:${userId}`) : undefined;
  const source = screen ? Track.Source.ScreenShare : Track.Source.Camera;
  const publication = participant?.getTrackPublication(source);
  if (room) {
    // Subscription policy stays hook-owned until M07/M10 adaptive migration.
    return participant && publication
      ? <VideoTrack trackRef={{ participant, publication, source }} manageSubscription={false}
          muted playsInline className={className} />
      : null;
  }
  return <LegacyMeetingVideo stream={stream} className={className} />;
}

// Only the explicit mesh rollback uses MediaStream element plumbing.
function LegacyMeetingVideo({ stream, className }: { stream?: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) element.srcObject = stream || null;
    return () => { if (element) element.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className={className} />;
}
