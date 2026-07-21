'use client';

import {
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function RecordingGrid() {
  const room = useRoomContext();
  const tracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
    { source: Track.Source.Camera, withPlaceholder: true },
  ]);

  useEffect(() => {
    let signalled = false;
    const startRecording = () => {
      if (signalled) return;
      signalled = true;
      // LiveKit Egress consumes this browser-console protocol message.
      console.log('START_RECORDING');
    };

    const hasPublishedTrack = Array.from(room.remoteParticipants.values()).some(
      (participant) => participant.trackPublications.size > 0
    );
    if (hasPublishedTrack) startRecording();
    else room.once(RoomEvent.TrackSubscribed, startRecording);

    return () => {
      room.off(RoomEvent.TrackSubscribed, startRecording);
    };
  }, [room]);

  return (
    <main className="flex h-screen flex-col bg-slate-950 p-8 text-white">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">TSMeet</p>
          <h1 className="text-xl font-semibold">Meeting recording</h1>
        </div>
        <div className="rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-200">● Recording</div>
      </header>
      <GridLayout tracks={tracks} className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-4">
        <ParticipantTile className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900" />
      </GridLayout>
      <RoomAudioRenderer />
    </main>
  );
}

function EgressLayoutContent() {
  const params = useSearchParams();
  const serverUrl = params.get('url') || '';
  const token = params.get('token') || '';
  if (!serverUrl || !token) return <main className="h-screen bg-slate-950" />;
  return (
    <LiveKitRoom serverUrl={serverUrl} token={token} connect audio={false} video={false}>
      <RecordingGrid />
    </LiveKitRoom>
  );
}

export default function EgressLayoutPage() {
  return (
    <Suspense fallback={<main className="h-screen bg-slate-950" />}>
      <EgressLayoutContent />
    </Suspense>
  );
}
