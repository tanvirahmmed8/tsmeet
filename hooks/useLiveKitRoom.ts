'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  VideoPresets,
} from 'livekit-client';
import { io, type Socket } from 'socket.io-client';
import type { BackgroundProcessorWrapper } from '@livekit/track-processors';
import { evaluateNetworkSample, type NetworkAdaptationState, type NetworkTier } from '@/lib/mediaNetworkPolicy';
import { mergeMeetingParticipants } from '@/lib/meetingParticipants';
import { setMicrophoneEnabledSafely } from '@/lib/microphoneOperation';
import { useMeetingChat } from './useMeetingChat';

type BackgroundMode = 'none' | 'blur' | 'image';
type JoinStatus = 'idle' | 'pending' | 'approved' | 'denied' | 'password-required' | 'password-incorrect';
type NetworkQuality = 'Excellent' | 'Good' | 'Poor' | 'Critical' | 'Unknown';

interface LiveKitConfig {
  signalingServer: string;
  enabled?: boolean;
  userName?: string;
  lowDataMode?: boolean;
  pinnedParticipantId?: string | null;
  activeSpeakerId?: string | null;
}

interface SignalingParticipant {
  socketId: string;
  userId: string;
  userData?: { name?: string };
}

interface PeerView {
  peerId: string;
  stream?: MediaStream;
  screenStream?: MediaStream;
  connected?: boolean;
  userData?: { name?: string };
  userId?: string;
}

interface JoinRequest extends SignalingParticipant { roomId: string }
interface UnmuteRequest extends SignalingParticipant { roomId: string }
interface RaisedHand {
  socketId: string;
  userId?: string;
  userData?: { name?: string };
}

function mediaStreamForParticipant(participant: Participant, screenShare = false) {
  const tracks = Array.from(participant.trackPublications.values())
    .filter((publication) =>
      !publication.isMuted && (
        screenShare
          ? publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio
          : publication.source !== Track.Source.ScreenShare && publication.source !== Track.Source.ScreenShareAudio
      )
    )
    .map((publication) => publication.track?.mediaStreamTrack)
    .filter((track): track is MediaStreamTrack => Boolean(track));
  return tracks.length > 0 ? new MediaStream(tracks) : undefined;
}

function identityUserId(identity: string) {
  return identity.startsWith('user:') ? identity.slice(5) : identity;
}

export function useLiveKitRoom(roomId: string, userId: string, config: LiveKitConfig) {
  const roomRef = useRef<Room | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selfSocketIdRef = useRef<string | null>(null);
  const approvedRef = useRef(false);
  const { chatMessages, unreadChatCount, setChatReadState, chatError, sendMessage, receiveMessage } = useMeetingChat(roomId, userId, socketRef, approvedRef);
  const pendingJoinRef = useRef<{ userName: string; isHost: boolean; roomPassword?: string; userData?: any } | null>(null);
  const signalingParticipantsRef = useRef<Map<string, SignalingParticipant>>(new Map());
  const hasSignalingSnapshotRef = useRef(false);
  const qualityOverridesRef = useRef<Map<string, VideoQuality | 'off'>>(new Map());
  const backgroundProcessorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const previewAudioRef = useRef<LocalAudioTrack | null>(null);
  const previewVideoRef = useRef<LocalVideoTrack | null>(null);
  const microphoneBusyRef = useRef(false);
  const cameraBusyRef = useRef(false);
  const microphoneWantedRef = useRef(false);
  const cameraWantedRef = useRef(false);
  const hostMutedRef = useRef(false);
  const mediaGenerationRef = useRef(0);
  const connectingRef = useRef(false);
  const inboundStatsRef = useRef<Map<string, { packetsReceived: number; packetsLost: number }>>(new Map());
  const outboundStatsRef = useRef<Map<string, { packetsReceived: number; packetsLost: number }>>(new Map());
  const networkAdaptationRef = useRef<NetworkAdaptationState>({ tier: 'excellent', candidateTier: null, candidateSamples: 0, healthySamples: 0 });
  const uplinkAdaptationRef = useRef<NetworkAdaptationState>({ tier: 'excellent', candidateTier: null, candidateSamples: 0, healthySamples: 0 });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [livekitRoom, setLivekitRoom] = useState<Room | undefined>(undefined);
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [unmuteRequests, setUnmuteRequests] = useState<UnmuteRequest[]>([]);
  const [isMutedByHost, setIsMutedByHost] = useState(false);
  const [unmuteRequested, setUnmuteRequested] = useState(false);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [isMeetingLocked, setIsMeetingLocked] = useState(false);
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>('none');
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);
  const [manualLowDataMode, setManualLowDataMode] = useState(Boolean(config.lowDataMode));
  const [automaticNetworkTier, setAutomaticNetworkTier] = useState<NetworkTier>('excellent');
  const [automaticUplinkTier, setAutomaticUplinkTier] = useState<NetworkTier>('excellent');
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('Unknown');
  const [coHosts, setCoHosts] = useState<Set<string>>(new Set());
  const isLowDataMode = manualLowDataMode || automaticNetworkTier === 'poor' || automaticNetworkTier === 'critical';

  const syncLocalStream = useCallback((participant?: LocalParticipant) => {
    const local = participant || roomRef.current?.localParticipant;
    if (!local || roomRef.current?.state === ConnectionState.Disconnected) {
      const tracks = [previewAudioRef.current, previewVideoRef.current]
        .filter((track) => track && !track.isMuted).map((track) => track!.mediaStreamTrack);
      setLocalStream(new MediaStream(tracks));
      return;
    }
    const microphone = local.getTrackPublication(Track.Source.Microphone)?.track;
    setIsMicOn(Boolean(local.isMicrophoneEnabled && microphone?.mediaStreamTrack.readyState === 'live'));
    setIsCameraOn(local.isCameraEnabled);
    setLocalStream(mediaStreamForParticipant(local) || new MediaStream());
  }, []);

  const syncRemoteParticipants = useCallback(() => {
    const room = roomRef.current;
    const roster = mergeMeetingParticipants(
      Array.from(signalingParticipantsRef.current.values()),
      Array.from(room?.remoteParticipants.values() || []), userId, hasSignalingSnapshotRef.current
    );
    setPeers(roster.map((member) => {
      const participant = member.media;
      return {
        peerId: member.peerId,
        userId: member.userId,
        userData: { name: member.name },
        stream: participant ? mediaStreamForParticipant(participant) : undefined,
        screenStream: participant ? mediaStreamForParticipant(participant, true) : undefined,
        connected: Boolean(participant),
      };
    }));
  }, [userId]);

  const applySubscriptionPolicy = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const pageHidden = typeof document !== 'undefined' && document.hidden;
    const effectiveTier: NetworkTier = manualLowDataMode ? 'poor' : automaticNetworkTier;
    const visibleLimit = pageHidden
      ? 1
      : effectiveTier === 'critical'
        ? 1
        : effectiveTier === 'poor'
          ? (isMobile ? 2 : 3)
          : effectiveTier === 'good'
            ? (isMobile ? 3 : 6)
            : (isMobile ? 4 : 9);
    const signalingByUser = new Map(
      Array.from(signalingParticipantsRef.current.values()).map((entry) => [String(entry.userId), entry])
    );
    const participants = Array.from(room.remoteParticipants.values()).sort((a, b) => {
      const aPeerId = signalingByUser.get(identityUserId(a.identity))?.socketId || a.identity;
      const bPeerId = signalingByUser.get(identityUserId(b.identity))?.socketId || b.identity;
      const score = (id: string) => id === config.pinnedParticipantId ? 2 : id === config.activeSpeakerId ? 1 : 0;
      return score(bPeerId) - score(aPeerId);
    });
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const galleryCount = participants.length + 1;
    const galleryColumns = galleryCount <= 1 ? 1 : galleryCount <= 4 ? 2 : galleryCount <= 9 ? 3 : 4;
    const estimatedTileWidth = viewportWidth / galleryColumns;

    participants.forEach((participant, index) => {
      const peerId = signalingByUser.get(identityUserId(participant.identity))?.socketId || participant.identity;
      const priority = peerId === config.pinnedParticipantId || peerId === config.activeSpeakerId;
      const override = qualityOverridesRef.current.get(peerId);
      participant.audioTrackPublications.forEach((publication) => publication.setSubscribed(true));
      participant.videoTrackPublications.forEach((publication) => {
        const isScreen = publication.source === Track.Source.ScreenShare;
        const subscribed = override !== 'off' && (isScreen || priority || (!pageHidden && index < visibleLimit));
        publication.setSubscribed(subscribed);
        if (!subscribed) return;
        const quality = override !== undefined
          ? override
          : effectiveTier === 'critical' || effectiveTier === 'poor'
            ? VideoQuality.LOW
            : isScreen || priority
            ? VideoQuality.HIGH
            : estimatedTileWidth < 480 || effectiveTier === 'good'
              ? VideoQuality.LOW
              : VideoQuality.MEDIUM;
        publication.setVideoDimensions(
          quality === VideoQuality.HIGH
            ? { width: 1280, height: 720 }
            : quality === VideoQuality.MEDIUM
              ? { width: 640, height: 360 }
              : { width: 320, height: 180 }
        );
      });
    });
  }, [automaticNetworkTier, config.activeSpeakerId, config.pinnedParticipantId, manualLowDataMode]);

  const connectToLiveKit = useCallback(async () => {
    if (config.enabled === false) return;
    if (roomRef.current?.state === ConnectionState.Connected) return;
    if (connectingRef.current) return;
    connectingRef.current = true;
    const generation = mediaGenerationRef.current;
    try {
    const response = await fetch('/api/media/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, displayName: config.userName || 'User' }),
    });
    const credentials = await response.json();
    if (!response.ok) throw new Error(credentials.error || 'Unable to obtain a media token');
    if (generation !== mediaGenerationRef.current) return;

    const room = new Room({
      // Tracks are rendered through composed MediaStreams rather than
      // RemoteTrack.attach(), so TSMeet owns adaptive subscription decisions.
      adaptiveStream: false,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: isLowDataMode
          ? { width: 320, height: 180, frameRate: 15 }
          : { width: 1280, height: 720, frameRate: 30 },
      },
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      },
    });
    roomRef.current = room;
    setLivekitRoom(room);

    room.on(RoomEvent.TrackSubscribed, syncRemoteParticipants);
    room.on(RoomEvent.TrackUnsubscribed, syncRemoteParticipants);
    room.on(RoomEvent.TrackPublished, syncRemoteParticipants);
    room.on(RoomEvent.TrackUnpublished, syncRemoteParticipants);
    room.on(RoomEvent.TrackMuted, (_publication, participant) => {
      if (participant.isLocal) {
        syncLocalStream(room.localParticipant);
      } else {
        syncRemoteParticipants();
      }
    });
    room.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
      if (participant.isLocal) {
        syncLocalStream(room.localParticipant);
      } else {
        syncRemoteParticipants();
      }
    });
    room.on(RoomEvent.ParticipantConnected, syncRemoteParticipants);
    room.on(RoomEvent.ParticipantDisconnected, syncRemoteParticipants);
    room.on(RoomEvent.TrackPublished, applySubscriptionPolicy);
    room.on(RoomEvent.ParticipantConnected, applySubscriptionPolicy);
    room.on(RoomEvent.LocalTrackPublished, () => syncLocalStream(room.localParticipant));
    room.on(RoomEvent.LocalTrackUnpublished, () => syncLocalStream(room.localParticipant));
    room.on(RoomEvent.Reconnecting, () => setError('Reconnecting media…'));
    room.on(RoomEvent.Reconnected, () => setError(null));
    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current !== room) return;
      syncRemoteParticipants();
      setNetworkQuality('Unknown');
      // LiveKit room deletion is the authoritative fallback when a signaling
      // event is missed during reconnect. Confirm durable room state before
      // treating an unexpected media disconnect as an ended meeting.
      void fetch(`/api/rooms/${roomId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
        .then(async (response) => response.ok ? response.json() : null)
        .then((roomData) => {
          if (roomData?.ended_at) {
            setMeetingEnded(true);
            setJoinStatus('denied');
            setError('The meeting has ended.');
          }
        })
        .catch(() => {
          // Socket.IO reconnection remains responsible for transient failures.
        });
    });
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (!participant.isLocal) return;
      setNetworkQuality(
        quality === 'excellent' ? 'Excellent' : quality === 'good' ? 'Good' : quality === 'poor' ? 'Poor' : 'Unknown'
      );
      if (quality === 'poor' && networkAdaptationRef.current.tier === 'excellent') {
        networkAdaptationRef.current = { tier: 'good', candidateTier: 'poor', candidateSamples: 1, healthySamples: 0 };
        setAutomaticNetworkTier('good');
      }
      socketRef.current?.emit('network-quality', { roomId, quality });
    });

    await room.connect(credentials.url, credentials.token, { autoSubscribe: false });
    if (roomRef.current !== room) { await room.disconnect(); return; }
    syncLocalStream(room.localParticipant);
    syncRemoteParticipants();
    applySubscriptionPolicy();
    // Keep pre-join preferences. Camera denial must not abort the microphone
    // or roster, and opening a meeting must never silently unmute someone.
    const results = await Promise.allSettled([
      (async () => {
        const preview = previewAudioRef.current;
        previewAudioRef.current = null;
        if (preview && microphoneWantedRef.current && !hostMutedRef.current) {
          await room.localParticipant.publishTrack(preview);
          if (hostMutedRef.current || !microphoneWantedRef.current) await preview.mute();
        } else {
          preview?.stop();
          await room.localParticipant.setMicrophoneEnabled(microphoneWantedRef.current && !hostMutedRef.current);
        }
      })(),
      (async () => {
        const preview = previewVideoRef.current;
        previewVideoRef.current = null;
        if (preview && cameraWantedRef.current) await room.localParticipant.publishTrack(preview);
        else { preview?.stop(); await room.localParticipant.setCameraEnabled(cameraWantedRef.current); }
      })(),
    ]);
    if (roomRef.current !== room) return;
    syncLocalStream(room.localParticipant);
    if (results.some((result) => result.status === 'rejected')) {
      setError('A camera or microphone could not start. Use its button to allow access and retry.');
    }
    } finally { connectingRef.current = false; }
  }, [applySubscriptionPolicy, config.enabled, config.userName, isLowDataMode, roomId, syncLocalStream, syncRemoteParticipants]);
  const connectToLiveKitRef = useRef(connectToLiveKit);

  useEffect(() => {
    connectToLiveKitRef.current = connectToLiveKit;
  }, [connectToLiveKit]);

  useEffect(() => {
    applySubscriptionPolicy();
  }, [applySubscriptionPolicy, peers.length]);

  useEffect(() => {
    const refreshPolicy = () => applySubscriptionPolicy();
    window.addEventListener('resize', refreshPolicy);
    document.addEventListener('visibilitychange', refreshPolicy);
    return () => {
      window.removeEventListener('resize', refreshPolicy);
      document.removeEventListener('visibilitychange', refreshPolicy);
    };
  }, [applySubscriptionPolicy]);

  useEffect(() => {
    const publication = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (!(track instanceof LocalVideoTrack) || !isCameraOn) return;
    const tier: NetworkTier = manualLowDataMode ? 'poor' : automaticUplinkTier;
    const resolution = tier === 'critical'
      ? { width: 320, height: 180, frameRate: 10 }
      : tier === 'poor'
        ? { width: 320, height: 180, frameRate: 15 }
        : tier === 'good'
          ? { width: 640, height: 360, frameRate: 24 }
          : { width: 1280, height: 720, frameRate: 30 };
    void track.restartTrack({ resolution, frameRate: resolution.frameRate }).then(() => syncLocalStream()).catch(() => {
      // WebRTC/LiveKit congestion control remains active if a camera cannot honor new constraints.
    });
  }, [automaticUplinkTier, isCameraOn, manualLowDataMode, syncLocalStream]);

  useEffect(() => {
    const rank: Record<NetworkTier, number> = { excellent: 0, good: 1, poor: 2, critical: 3 };
    const tier = rank[automaticUplinkTier] > rank[automaticNetworkTier] ? automaticUplinkTier : automaticNetworkTier;
    setNetworkQuality(tier === 'critical' ? 'Critical' : tier === 'poor' ? 'Poor' : tier === 'good' ? 'Good' : 'Excellent');
  }, [automaticNetworkTier, automaticUplinkTier]);

  useEffect(() => {
    if (config.enabled === false) return;
    const inboundStats = inboundStatsRef.current;
    const outboundStats = outboundStatsRef.current;
    const sampleInboundQuality = async () => {
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) return;
      let receivedDelta = 0;
      let lostDelta = 0;
      let jitterMs = 0;
      let rttMs = 0;
      let availableIncomingBitrate: number | null = null;
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          const track = publication.track;
          if (!track || !('getRTCStatsReport' in track)) continue;
          const report = await track.getRTCStatsReport();
          report?.forEach((stat) => {
            if (stat.type === 'candidate-pair' && (stat.selected || stat.nominated || stat.state === 'succeeded')) {
              rttMs = Math.max(rttMs, Number(stat.currentRoundTripTime || 0) * 1000);
              const available = Number(stat.availableIncomingBitrate || 0);
              if (available > 0) availableIncomingBitrate = availableIncomingBitrate === null ? available : Math.min(availableIncomingBitrate, available);
            }
            if (stat.type !== 'inbound-rtp' || stat.isRemote) return;
            jitterMs = Math.max(jitterMs, Number(stat.jitter || 0) * 1000);
            const key = `${participant.sid}:${publication.trackSid}:${stat.ssrc || stat.id}`;
            const current = {
              packetsReceived: Number(stat.packetsReceived || 0),
              packetsLost: Number(stat.packetsLost || 0),
            };
            const previous = inboundStats.get(key);
            inboundStats.set(key, current);
            if (!previous) return;
            receivedDelta += Math.max(0, current.packetsReceived - previous.packetsReceived);
            lostDelta += Math.max(0, current.packetsLost - previous.packetsLost);
          });
        }
      }
      const decision = evaluateNetworkSample(networkAdaptationRef.current, {
        packetsReceivedDelta: receivedDelta,
        packetsLostDelta: lostDelta,
        jitterMs,
        rttMs,
        availableIncomingBitrate,
      });
      networkAdaptationRef.current = decision;
      if (decision.action !== 'none') {
        setAutomaticNetworkTier(decision.tier);
        socketRef.current?.emit('network-quality', { roomId, quality: decision.tier });
      }

      const localVideo = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (localVideo && 'getRTCStatsReport' in localVideo) {
        let uplinkReceivedDelta = 0;
        let uplinkLostDelta = 0;
        let uplinkJitterMs = 0;
        let uplinkRttMs = 0;
        let availableOutgoingBitrate: number | null = null;
        const report = await localVideo.getRTCStatsReport();
        report?.forEach((stat) => {
          if (stat.type === 'candidate-pair' && (stat.selected || stat.nominated || stat.state === 'succeeded')) {
            uplinkRttMs = Math.max(uplinkRttMs, Number(stat.currentRoundTripTime || 0) * 1000);
            const available = Number(stat.availableOutgoingBitrate || 0);
            if (available > 0) availableOutgoingBitrate = availableOutgoingBitrate === null ? available : Math.min(availableOutgoingBitrate, available);
          }
          if (stat.type !== 'remote-inbound-rtp') return;
          uplinkJitterMs = Math.max(uplinkJitterMs, Number(stat.jitter || 0) * 1000);
          uplinkRttMs = Math.max(uplinkRttMs, Number(stat.roundTripTime || 0) * 1000);
          const key = `uplink:${stat.localId || stat.ssrc || stat.id}`;
          const current = { packetsReceived: Number(stat.packetsReceived || 0), packetsLost: Number(stat.packetsLost || 0) };
          const previous = outboundStats.get(key);
          outboundStats.set(key, current);
          if (!previous) return;
          uplinkReceivedDelta += Math.max(0, current.packetsReceived - previous.packetsReceived);
          uplinkLostDelta += Math.max(0, current.packetsLost - previous.packetsLost);
        });
        const uplinkDecision = evaluateNetworkSample(uplinkAdaptationRef.current, {
          packetsReceivedDelta: uplinkReceivedDelta,
          packetsLostDelta: uplinkLostDelta,
          jitterMs: uplinkJitterMs,
          rttMs: uplinkRttMs,
          availableIncomingBitrate: availableOutgoingBitrate,
        });
        uplinkAdaptationRef.current = uplinkDecision;
        if (uplinkDecision.action !== 'none') setAutomaticUplinkTier(uplinkDecision.tier);
      }
    };
    const timer = window.setInterval(() => void sampleInboundQuality(), 5_000);
    return () => {
      window.clearInterval(timer);
      inboundStats.clear();
      outboundStats.clear();
      networkAdaptationRef.current = { tier: 'excellent', candidateTier: null, candidateSamples: 0, healthySamples: 0 };
      uplinkAdaptationRef.current = { tier: 'excellent', candidateTier: null, candidateSamples: 0, healthySamples: 0 };
    };
  }, [config.enabled, roomId]);

  const applyBackground = useCallback(async (mode: BackgroundMode, imagePath?: string | null) => {
    const publication = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.track;
    if (!(track instanceof LocalVideoTrack)) return;
    try {
      if (mode === 'none') {
        await track.stopProcessor();
        backgroundProcessorRef.current = null;
      } else {
        const { BackgroundProcessor, supportsBackgroundProcessors } = await import('@livekit/track-processors');
        if (!supportsBackgroundProcessors()) throw new Error('Background effects are unavailable in this browser');
        const options = mode === 'blur'
          ? { mode: 'background-blur' as const, blurRadius: 12 }
          : { mode: 'virtual-background' as const, imagePath: imagePath || '' };
        if (mode === 'image' && !imagePath) throw new Error('Choose a background image first');
        if (backgroundProcessorRef.current) {
          await backgroundProcessorRef.current.switchTo(options);
        } else {
          const processor = BackgroundProcessor(options);
          await track.setProcessor(processor);
          backgroundProcessorRef.current = processor;
        }
      }
      setBackgroundModeState(mode);
      syncLocalStream();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply background effect');
    }
  }, [syncLocalStream]);

  useEffect(() => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices) return;
    const recoverDevices = async () => {
      const participant = roomRef.current?.localParticipant;
      if (!participant || !approvedRef.current) return;
      try {
        const microphone = participant.getTrackPublication(Track.Source.Microphone)?.track;
        if (microphoneWantedRef.current && !hostMutedRef.current && !microphoneBusyRef.current &&
          (!microphone || microphone.mediaStreamTrack.readyState === 'ended')) {
          // Do not recapture from a device event: Safari may require a fresh tap.
          microphoneWantedRef.current = false;
          setIsMicOn(false);
          setError('Microphone disconnected. Tap the microphone to allow access and reconnect.');
          return;
        }
        if (isCameraOn && !participant.getTrackPublication(Track.Source.Camera)?.track) {
          await participant.setCameraEnabled(true);
          if (backgroundMode !== 'none') await applyBackground(backgroundMode, backgroundImage);
        }
        syncLocalStream(participant);
        setError(null);
      } catch {
        setError('A camera or microphone became unavailable. Check browser permissions and choose another device.');
      }
    };
    mediaDevices.addEventListener('devicechange', recoverDevices);
    return () => mediaDevices.removeEventListener('devicechange', recoverDevices);
  }, [applyBackground, backgroundImage, backgroundMode, isCameraOn, isMicOn, syncLocalStream]);

  const disconnectMedia = useCallback(() => {
    mediaGenerationRef.current += 1;
    approvedRef.current = false;
    previewAudioRef.current?.stop(); previewAudioRef.current = null;
    previewVideoRef.current?.stop(); previewVideoRef.current = null;
    microphoneWantedRef.current = false; cameraWantedRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    setLivekitRoom(undefined);
    room?.disconnect();
    setLocalStream(null);
    setPeers([]);
    signalingParticipantsRef.current.clear();
    hasSignalingSnapshotRef.current = false;
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
  }, []);

  useEffect(() => {
    if (config.enabled === false || !userId) return;
    const socket = io(config.signalingServer, {
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on('receive-message', receiveMessage);

    const emitPendingJoin = () => {
      selfSocketIdRef.current = socket.id || null;
      const pending = pendingJoinRef.current;
      if (!pending) return;
      socket.emit('request-join', {
        roomId, userId, userData: { name: pending.userName, ...pending.userData },
        isHost: pending.isHost, roomPassword: pending.roomPassword,
      });
    };
    socket.on('connect', emitPendingJoin);
    socket.on('connect_error', () => setError('Meeting connection interrupted. Retrying…'));
    socket.on('join-pending', () => setJoinStatus('pending'));
    socket.on('join-approved', async (data) => {
      approvedRef.current = true;
      setJoinStatus('approved');
      setIsHost(Boolean(data?.isHost));
      try { await connectToLiveKitRef.current(); } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to connect media');
      }
    });
    socket.on('join-denied', (data) => {
      pendingJoinRef.current = null;
      setJoinStatus('denied');
      setError(data?.message || 'The server could not authorize this account for the meeting.');
    });
    socket.on('password-required', () => setJoinStatus('password-required'));
    socket.on('password-incorrect', () => setJoinStatus('password-incorrect'));
    socket.on('join-request', (request: JoinRequest) => setPendingRequests((items) =>
      items.some((item) => item.socketId === request.socketId) ? items : [...items, request]));
    const updateParticipants = (participants: SignalingParticipant[]) => {
      hasSignalingSnapshotRef.current = true;
      signalingParticipantsRef.current = new Map(participants.map((item) => [item.socketId, item]));
      syncRemoteParticipants();
    };
    socket.on('room-participants', updateParticipants);
    socket.on('visible-participants-updated', updateParticipants);
    socket.on('user-left', ({ socketId }) => {
      signalingParticipantsRef.current.delete(socketId);
      setRaisedHands((items) => items.filter((item) => item.socketId !== socketId));
      syncRemoteParticipants();
    });
    socket.on('host-changed', ({ hostSocketId }) => setIsHost(hostSocketId === selfSocketIdRef.current));
    socket.on('cohost-promoted', ({ userId: value }) => setCoHosts((items) => new Set(items).add(String(value))));
    socket.on('cohost-demoted', ({ userId: value }) => setCoHosts((items) => {
      const next = new Set(items); next.delete(String(value)); return next;
    }));
    socket.on('unmute-request', (request: UnmuteRequest) => setUnmuteRequests((items) =>
      items.some((item) => item.socketId === request.socketId) ? items : [...items, request]));
    socket.on('hand-raised', (hand: RaisedHand) => setRaisedHands((items) =>
      items.some((item) => item.socketId === hand.socketId) ? items : [...items, hand]));
    socket.on('hand-lowered', ({ socketId }) => setRaisedHands((items) => items.filter((item) => item.socketId !== socketId)));
    socket.on('force-mute', async () => {
      hostMutedRef.current = true;
      microphoneWantedRef.current = false;
      setIsMutedByHost(true); setUnmuteRequested(false);
      try {
        await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
        previewAudioRef.current?.stop(); previewAudioRef.current = null;
        setIsMicOn(false); syncLocalStream();
      } catch { setError('Unable to mute the microphone. Please mute it using your device controls.'); }
    });
    socket.on('allow-unmute', () => {
      // Safari requires capture to start from a user gesture, not a socket event.
      hostMutedRef.current = false;
      setIsMutedByHost(false); setUnmuteRequested(false);
      setError('The host approved unmuting. Tap the microphone to turn it on.');
    });
    socket.on('unmute-denied', () => { setUnmuteRequested(false); setIsMutedByHost(true); });
    socket.on('force-video-off', async () => {
      await roomRef.current?.localParticipant.setCameraEnabled(false);
      setIsCameraOn(false); syncLocalStream();
    });
    socket.on('meeting-ended', () => {
      pendingJoinRef.current = null;
      setMeetingEnded(true); setJoinStatus('denied'); setError('The meeting has ended.'); disconnectMedia();
    });
    socket.on('participant-removed', () => {
      pendingJoinRef.current = null;
      setJoinStatus('denied'); setError('You were removed from the meeting.'); disconnectMedia();
    });
    socket.on('meeting-lock-changed', ({ locked }) => setIsMeetingLocked(Boolean(locked)));
    socket.on('meeting-end-failed', () => setError('Failed to end the meeting. Please try again.'));
    socket.on('auth-error', (data) => setError(data?.message || 'Meeting authentication failed'));

    return () => {
      socket.removeAllListeners(); socket.disconnect(); socketRef.current = null;
      disconnectMedia();
    };
  }, [config.enabled, config.signalingServer, disconnectMedia, receiveMessage, roomId, syncLocalStream, syncRemoteParticipants, userId]);

  const emit = useCallback((event: string, payload: object) => socketRef.current?.emit(event, payload), []);
  const requestJoin = useCallback((payload: { userName: string; isHost: boolean; roomPassword?: string; userData?: any }) => {
    setJoinStatus('pending'); pendingJoinRef.current = payload;
    if (socketRef.current?.connected) {
      socketRef.current.emit('request-join', {
        roomId, userId, userData: { name: payload.userName, ...payload.userData },
        isHost: payload.isHost, roomPassword: payload.roomPassword,
      });
    }
  }, [roomId, userId]);

  const approveJoin = useCallback((targetSocketId: string) => { emit('approve-join', { roomId, targetSocketId }); setPendingRequests((v) => v.filter((x) => x.socketId !== targetSocketId)); }, [emit, roomId]);
  const denyJoin = useCallback((targetSocketId: string) => { emit('deny-join', { roomId, targetSocketId }); setPendingRequests((v) => v.filter((x) => x.socketId !== targetSocketId)); }, [emit, roomId]);
  const approveAll = useCallback(() => { emit('approve-all', { roomId }); setPendingRequests([]); }, [emit, roomId]);
  const hostMute = useCallback((targetSocketId: string) => emit('host-mute', { roomId, targetSocketId }), [emit, roomId]);
  const hostStopVideo = useCallback((targetSocketId: string) => emit('host-stop-video', { roomId, targetSocketId }), [emit, roomId]);
  const hostMuteAll = useCallback(() => emit('host-mute-all', { roomId }), [emit, roomId]);
  const removeParticipant = useCallback((targetSocketId: string) => emit('remove-participant', { roomId, targetSocketId }), [emit, roomId]);
  const setMeetingLocked = useCallback((locked: boolean) => emit('set-meeting-lock', { roomId, locked }), [emit, roomId]);
  const requestUnmute = useCallback(() => { setUnmuteRequested(true); emit('request-unmute', { roomId, userId, userData: { name: config.userName || 'User' } }); }, [config.userName, emit, roomId, userId]);
  const approveUnmute = useCallback((targetSocketId: string) => { emit('approve-unmute', { roomId, targetSocketId }); setUnmuteRequests((v) => v.filter((x) => x.socketId !== targetSocketId)); }, [emit, roomId]);
  const denyUnmute = useCallback((targetSocketId: string) => { emit('deny-unmute', { roomId, targetSocketId }); setUnmuteRequests((v) => v.filter((x) => x.socketId !== targetSocketId)); }, [emit, roomId]);
  const transferHost = useCallback((targetSocketId: string) => emit('transfer-host', { roomId, targetSocketId }), [emit, roomId]);
  const promoteToCoHost = useCallback((targetSocketId: string) => emit('promote-cohost', { roomId, targetSocketId }), [emit, roomId]);
  const demoteFromCoHost = useCallback((targetSocketId: string) => emit('demote-cohost', { roomId, targetSocketId }), [emit, roomId]);
  const endMeeting = useCallback(() => emit('end-meeting', { roomId }), [emit, roomId]);
  const raiseHand = useCallback(() => { setIsHandRaised(true); emit('raise-hand', { roomId, userId, userData: { name: config.userName || 'User' } }); }, [config.userName, emit, roomId, userId]);
  const lowerHand = useCallback(() => { setIsHandRaised(false); emit('lower-hand', { roomId }); }, [emit, roomId]);

  const toggleCamera = useCallback(async () => {
    if (cameraBusyRef.current) return;
    cameraBusyRef.current = true;
    const participant = roomRef.current?.state === ConnectionState.Connected ? roomRef.current.localParticipant : null;
    const enabled = participant ? !participant.isCameraEnabled : !cameraWantedRef.current;
    const generation = mediaGenerationRef.current;
    try {
      if (participant) await participant.setCameraEnabled(enabled);
      else if (enabled) {
        const track = await createLocalVideoTrack();
        if (generation !== mediaGenerationRef.current) { track.stop(); return; }
        if (roomRef.current?.state === ConnectionState.Connected) {
          await roomRef.current.localParticipant.publishTrack(track);
        } else previewVideoRef.current = track;
      } else { previewVideoRef.current?.stop(); previewVideoRef.current = null; }
      cameraWantedRef.current = enabled;
      setIsCameraOn(enabled); syncLocalStream(participant || undefined); setError(null);
      if (enabled && backgroundMode !== 'none') await applyBackground(backgroundMode, backgroundImage);
    } catch { setError('Camera access failed. Check permission or select another camera.'); }
    finally { cameraBusyRef.current = false; }
  }, [applyBackground, backgroundImage, backgroundMode, syncLocalStream]);
  const toggleMicrophone = useCallback(async () => {
    if (hostMutedRef.current || microphoneBusyRef.current) return;
    microphoneBusyRef.current = true;
    const participant = roomRef.current?.state === ConnectionState.Connected ? roomRef.current.localParticipant : null;
    const microphone = participant?.getTrackPublication(Track.Source.Microphone)?.track;
    const enabled = participant
      ? !(participant.isMicrophoneEnabled && microphone && microphone.mediaStreamTrack.readyState !== 'ended')
      : !microphoneWantedRef.current;
    const generation = mediaGenerationRef.current;
    const isCurrentAndAllowed = () => generation === mediaGenerationRef.current && !hostMutedRef.current;
    try {
      if (participant) {
        if (!await setMicrophoneEnabledSafely(participant, enabled, isCurrentAndAllowed)) return;
      }
      else if (enabled) {
        const track = await createLocalAudioTrack();
        if (generation !== mediaGenerationRef.current || hostMutedRef.current) { track.stop(); return; }
        if (roomRef.current?.state === ConnectionState.Connected) {
          try { await roomRef.current.localParticipant.publishTrack(track); }
          catch (cause) { track.stop(); throw cause; }
          if (!isCurrentAndAllowed()) { await track.mute(); track.stop(); return; }
        } else previewAudioRef.current = track;
      } else { previewAudioRef.current?.stop(); previewAudioRef.current = null; }
      if (!isCurrentAndAllowed()) return;
      microphoneWantedRef.current = enabled;
      setIsMicOn(enabled); syncLocalStream(participant || undefined); setError(null);
    }
    catch {
      if (isCurrentAndAllowed()) {
        syncLocalStream(participant || undefined);
        setError('Microphone access failed. Check permission or select another microphone.');
      }
    }
    finally { microphoneBusyRef.current = false; }
  }, [syncLocalStream]);
  const toggleScreenShare = useCallback(async (includeDeviceAudio = false) => {
    const participant = roomRef.current?.localParticipant; if (!participant) return;
    const enabled = !isScreenSharing;
    try {
      await participant.setScreenShareEnabled(enabled, { audio: includeDeviceAudio });
      setIsScreenSharing(enabled); syncLocalStream(participant); setError(null);
    } catch { setError('Screen sharing was cancelled or denied by the browser.'); }
  }, [isScreenSharing, syncLocalStream]);
  const setBackgroundMode = useCallback((mode: BackgroundMode) => {
    void applyBackground(mode, backgroundImage);
  }, [applyBackground, backgroundImage]);
  const setBackgroundImage = useCallback((imagePath: string | null) => {
    setBackgroundImageState(imagePath);
    if (backgroundMode === 'image' && imagePath) void applyBackground('image', imagePath);
  }, [applyBackground, backgroundMode]);
  const switchCameraInput = useCallback(async (deviceId: string) => {
    try { await roomRef.current?.switchActiveDevice('videoinput', deviceId); syncLocalStream(); setError(null); }
    catch { setError('Unable to switch camera. Check that the device is connected and permitted.'); }
  }, [syncLocalStream]);
  const switchMicrophoneInput = useCallback(async (deviceId: string) => {
    try { await roomRef.current?.switchActiveDevice('audioinput', deviceId); syncLocalStream(); setError(null); }
    catch { setError('Unable to switch microphone. Check that the device is connected and permitted.'); }
  }, [syncLocalStream]);
  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave-room', roomId, userId);
    disconnectMedia();
  }, [disconnectMedia, roomId, userId]);
  const setIsLowDataMode = useCallback((enabled: boolean) => setManualLowDataMode(enabled), []);
  const setParticipantVideoQuality = useCallback((peerId: string, quality: 'high' | 'medium' | 'low' | 'off') => {
    qualityOverridesRef.current.set(peerId, quality === 'off' ? 'off' : {
      high: VideoQuality.HIGH,
      medium: VideoQuality.MEDIUM,
      low: VideoQuality.LOW,
    }[quality]);
    applySubscriptionPolicy();
  }, [applySubscriptionPolicy]);

  return {
    livekitRoom,
    chatMessages, unreadChatCount, setChatReadState, chatError, sendMessage,
    localStream, peers, error, isCameraOn, isMicOn, isScreenSharing, joinStatus,
    pendingRequests, isHost, unmuteRequests, isMutedByHost, unmuteRequested,
    raisedHands, isHandRaised, backgroundMode, backgroundImage, isLowDataMode,
    networkQuality, coHosts, setBackgroundMode, setBackgroundImage, setIsLowDataMode,
    requestJoin, approveJoin, denyJoin, approveAll, hostMute, hostStopVideo, hostMuteAll,
    requestUnmute, approveUnmute, denyUnmute, transferHost, promoteToCoHost,
    demoteFromCoHost, endMeeting, raiseHand, lowerHand, toggleCamera, toggleMicrophone,
    switchCameraInput, switchMicrophoneInput, toggleScreenShare, leaveRoom, meetingEnded,
    setParticipantVideoQuality, removeParticipant, isMeetingLocked, setMeetingLocked,
  };
}
