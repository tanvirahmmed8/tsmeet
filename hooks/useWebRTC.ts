'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import SimplePeer from 'simple-peer';
import { io, Socket } from 'socket.io-client';

interface PeerConnection {
  peerId: string;
  peer: SimplePeer.Instance;
  stream?: MediaStream;
  hidden?: boolean;
  connected?: boolean;
  userData?: { name?: string };
  userId?: string;
}

interface WebRTCConfig {
  signalingServer: string;
  userName?: string;
  iceServers?: Array<{ urls: string | string[] }>;
  turnServers?: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}

type BackgroundMode = 'none' | 'blur' | 'image';

type JoinStatus = 'idle' | 'pending' | 'approved' | 'denied';

interface JoinRequest {
  roomId: string;
  socketId: string;
  userId: string;
  userData?: { name?: string };
}

interface UnmuteRequest {
  roomId: string;
  socketId: string;
  userId?: string;
  userData?: { name?: string };
}

interface RaisedHand {
  socketId: string;
  userId?: string;
  userData?: { name?: string };
}

export const useWebRTC = (roomId: string, userId: string, config: WebRTCConfig) => {
  const socketRef = useRef<Socket | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const micAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const processedVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const effectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectVideoRef = useRef<HTMLVideoElement | null>(null);
  const effectRafRef = useRef<number | null>(null);
  const segmentationRef = useRef<any>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundModeRef = useRef<BackgroundMode>('none');
  const approvedRef = useRef(false);
  const selfSocketIdRef = useRef<string | null>(null);
  const pendingJoinRef = useRef<{ userName: string; isHost: boolean } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>('none');
  const [backgroundImage, setBackgroundImageState] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [unmuteRequests, setUnmuteRequests] = useState<UnmuteRequest[]>([]);
  const [isMutedByHost, setIsMutedByHost] = useState(false);
  const [unmuteRequested, setUnmuteRequested] = useState(false);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);

  const applyVideoTrack = useCallback((nextTrack: MediaStreamTrack | null) => {
    if (!localStreamRef.current) return;

    const currentTrack = currentVideoTrackRef.current;
    if (currentTrack && nextTrack && currentTrack.id === nextTrack.id) return;

    if (currentTrack) {
      localStreamRef.current.removeTrack(currentTrack);
    }
    if (nextTrack) {
      localStreamRef.current.addTrack(nextTrack);
    }
    currentVideoTrackRef.current = nextTrack;

    for (const connection of peersRef.current.values()) {
      try {
        if (currentTrack && nextTrack) {
          connection.peer.replaceTrack(currentTrack, nextTrack, localStreamRef.current);
        } else if (currentTrack && !nextTrack) {
          connection.peer.removeTrack(currentTrack, localStreamRef.current);
        } else if (!currentTrack && nextTrack) {
          connection.peer.addTrack(nextTrack, localStreamRef.current);
        }
      } catch (err) {
        console.warn('[WebRTC] video track update failed:', err);
      }
    }

    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
  }, []);

  const applyAudioTrack = useCallback((nextTrack: MediaStreamTrack | null) => {
    if (!localStreamRef.current) return;

    const currentTrack = currentAudioTrackRef.current;
    if (currentTrack && nextTrack && currentTrack.id === nextTrack.id) return;

    if (currentTrack) {
      localStreamRef.current.removeTrack(currentTrack);
    }
    if (nextTrack) {
      localStreamRef.current.addTrack(nextTrack);
    }
    currentAudioTrackRef.current = nextTrack;

    for (const connection of peersRef.current.values()) {
      try {
        if (currentTrack && nextTrack) {
          connection.peer.replaceTrack(currentTrack, nextTrack, localStreamRef.current);
        } else if (currentTrack && !nextTrack) {
          connection.peer.removeTrack(currentTrack, localStreamRef.current);
        } else if (!currentTrack && nextTrack) {
          connection.peer.addTrack(nextTrack, localStreamRef.current);
        }
      } catch (err) {
        console.warn('[WebRTC] audio track update failed:', err);
      }
    }

    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
  }, []);

  const requestJoin = useCallback(
    (payload: { userName: string; isHost: boolean }) => {
      setJoinStatus('pending');
      pendingJoinRef.current = payload;
      if (!socketRef.current || !socketRef.current.connected) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      socketRef.current.emit('request-join', {
        roomId,
        userId,
        userData: { name: payload.userName },
        isHost: payload.isHost,
        token,
      });
      pendingJoinRef.current = null;
    },
    [roomId, userId]
  );

  const approveJoin = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('approve-join', { roomId, targetSocketId });
    setPendingRequests((prev) => prev.filter((req) => req.socketId !== targetSocketId));
  }, [roomId]);

  const denyJoin = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('deny-join', { roomId, targetSocketId });
    setPendingRequests((prev) => prev.filter((req) => req.socketId !== targetSocketId));
  }, [roomId]);

  const approveAll = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('approve-all', { roomId });
    setPendingRequests([]);
  }, [roomId]);

  const hostMute = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('host-mute', { roomId, targetSocketId });
  }, [roomId]);

  const hostStopVideo = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('host-stop-video', { roomId, targetSocketId });
  }, [roomId]);

  const hostMuteAll = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('host-mute-all', { roomId });
  }, [roomId]);

  const requestUnmute = useCallback(() => {
    if (!socketRef.current) return;
    setUnmuteRequested(true);
    socketRef.current.emit('request-unmute', {
      roomId,
      userId,
      userData: { name: config.userName || 'User' },
    });
  }, [roomId, userId, config.userName]);

  const approveUnmute = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('approve-unmute', { roomId, targetSocketId });
    setUnmuteRequests((prev) => prev.filter((req) => req.socketId !== targetSocketId));
  }, [roomId]);

  const denyUnmute = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('deny-unmute', { roomId, targetSocketId });
    setUnmuteRequests((prev) => prev.filter((req) => req.socketId !== targetSocketId));
  }, [roomId]);

  const playRaiseHandSound = useCallback(() => {
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = audioContextRef.current || new AudioContextCtor();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (err) {
      console.warn('[WebRTC] Unable to play raise hand sound:', err);
    }
  }, []);

  const raiseHand = useCallback(() => {
    if (!socketRef.current) return;
    setIsHandRaised(true);
    socketRef.current.emit('raise-hand', {
      roomId,
      userId,
      userData: { name: config.userName || 'User' },
    });
  }, [roomId, userId, config.userName]);

  const lowerHand = useCallback(() => {
    if (!socketRef.current) return;
    setIsHandRaised(false);
    socketRef.current.emit('lower-hand', { roomId });
  }, [roomId]);

  const initializeLocalStream = useCallback(async () => {
    const rawStream = new MediaStream();
    const localStream = new MediaStream();
    rawStreamRef.current = rawStream;
    localStreamRef.current = localStream;
    cameraVideoTrackRef.current = null;
    currentVideoTrackRef.current = null;
    micAudioTrackRef.current = null;
    currentAudioTrackRef.current = null;
    setLocalStream(new MediaStream(localStream.getTracks()));
    return localStream;
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(
    (peerId: string, initiator: boolean, stream: MediaStream, options?: { hidden?: boolean; userData?: any; userId?: string }) => {
      const iceServers = config.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream,
        config: {
          iceServers: [...iceServers, ...(config.turnServers || [])],
        },
      });

      peer.on('signal', (signal: any) => {
        if (socketRef.current) {
          if (signal.type === 'offer') {
            socketRef.current.emit('send-offer', {
              roomId,
              targetSocketId: peerId,
              offer: signal,
            });
          } else if (signal.type === 'answer') {
            socketRef.current.emit('send-answer', {
              roomId,
              targetSocketId: peerId,
              answer: signal,
            });
          } else if (signal.candidate) {
            socketRef.current.emit('send-ice-candidate', {
              roomId,
              targetSocketId: peerId,
              candidate: signal,
            });
          }
        }
      });

      peer.on('stream', (stream: MediaStream) => {
        const connection = peersRef.current.get(peerId);
        if (connection) {
          connection.stream = stream;
          setPeers(Array.from(peersRef.current.values()).filter((entry) => !entry.hidden));
        }
      });

      peer.on('connect', () => {
        const connection = peersRef.current.get(peerId);
        if (connection) {
          connection.connected = true;
          setPeers(Array.from(peersRef.current.values()).filter((entry) => !entry.hidden));
        }
      });

      peer.on('error', (err: any) => {
        console.error(`Peer error for ${peerId}:`, err);
        removePeerConnection(peerId);
      });

      peer.on('close', () => {
        removePeerConnection(peerId);
      });

      const connection: PeerConnection = { 
        peerId, 
        peer, 
        hidden: options?.hidden ?? false,
        userData: options?.userData,
        userId: options?.userId
      };
      peersRef.current.set(peerId, connection);
      setPeers(Array.from(peersRef.current.values()).filter((entry) => !entry.hidden));

      return peer;
    },
    [roomId]
  );

  // Remove peer connection
  const removePeerConnection = useCallback((peerId: string) => {
    const connection = peersRef.current.get(peerId);
    if (connection) {
      connection.peer.destroy();
      peersRef.current.delete(peerId);
      setPeers(Array.from(peersRef.current.values()).filter((entry) => !entry.hidden));
    }
  }, []);

  const cleanupRoom = useCallback((notifyServer: boolean) => {
    if (socketRef.current) {
      if (notifyServer && socketRef.current.connected) {
        socketRef.current.emit('leave-room', roomId, userId);
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    peersRef.current.forEach((connection) => {
      connection.peer.destroy();
    });
    peersRef.current.clear();
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    rawStreamRef.current = null;
    micAudioTrackRef.current = null;
    screenAudioTrackRef.current = null;
    currentAudioTrackRef.current = null;
    cameraVideoTrackRef.current = null;
    screenVideoTrackRef.current = null;
    currentVideoTrackRef.current = null;
    approvedRef.current = false;
    selfSocketIdRef.current = null;
    setLocalStream(null);
  }, [roomId, userId]);

  // Initialize socket connection
  useEffect(() => {
    const initializeSocket = async () => {
      const stream = await initializeLocalStream();
      if (!stream) return;

      socketRef.current = io(config.signalingServer, {
        auth: {
          token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      socketRef.current.on('connect', () => {
        selfSocketIdRef.current = socketRef.current?.id || null;
        approvedRef.current = false;
        setMeetingEnded(false);
        console.log('[WebRTC] Connected to signaling server');

        if (pendingJoinRef.current) {
          const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
          socketRef.current?.emit('request-join', {
            roomId,
            userId,
            userData: { name: pendingJoinRef.current.userName },
            isHost: pendingJoinRef.current.isHost,
            token,
          });
          pendingJoinRef.current = null;
        }
      });

      socketRef.current.on('join-pending', () => {
        setJoinStatus('pending');
      });

      socketRef.current.on('join-approved', (data: any) => {
        approvedRef.current = true;
        setJoinStatus('approved');
        setIsHost(Boolean(data?.isHost));
        setError(null);
      });

      socketRef.current.on('join-denied', () => {
        approvedRef.current = false;
        setJoinStatus('denied');
      });

      socketRef.current.on('join-request', (req: JoinRequest) => {
        setPendingRequests((prev) => {
          if (prev.some((p) => p.socketId === req.socketId)) return prev;
          return [...prev, req];
        });
      });

      socketRef.current.on('unmute-request', (req: UnmuteRequest) => {
        setUnmuteRequests((prev) => {
          if (prev.some((p) => p.socketId === req.socketId)) return prev;
          return [...prev, req];
        });
      });

      socketRef.current.on('hand-raised', (data: RaisedHand) => {
        setRaisedHands((prev) => {
          if (prev.some((p) => p.socketId === data.socketId)) return prev;
          return [...prev, data];
        });

        if (data.socketId !== selfSocketIdRef.current) {
          playRaiseHandSound();
        }
      });

      socketRef.current.on('hand-lowered', (data: { socketId: string }) => {
        setRaisedHands((prev) => prev.filter((p) => p.socketId !== data.socketId));
      });

      socketRef.current.on('host-changed', (data: any) => {
        const hostSocketId = data?.hostSocketId || null;
        setIsHost(Boolean(hostSocketId) && hostSocketId === selfSocketIdRef.current);
      });

      socketRef.current.on('meeting-ended', () => {
        setMeetingEnded(true);
        setJoinStatus('denied');
        setIsHost(false);
        setPendingRequests([]);
        setUnmuteRequests([]);
        setRaisedHands([]);
        setError('The meeting has ended.');
        cleanupRoom(false);
      });

      socketRef.current.on('meeting-end-failed', () => {
        setError('Failed to end the meeting. Please try again.');
      });

      socketRef.current.on('room-participants', (participants: any[]) => {
        if (!approvedRef.current) return;
        participants.forEach((participant) => {
          const existing = peersRef.current.get(participant.socketId);
          if (existing) {
            existing.userData = participant.userData;
            existing.userId = participant.userId;
            setPeers(Array.from(peersRef.current.values()).filter((entry) => !entry.hidden));
          } else {
            createPeerConnection(participant.socketId, true, localStreamRef.current || stream, {
              userData: participant.userData,
              userId: participant.userId
            });
          }
        });
      });

      socketRef.current.on('user-joined', (data: any) => {
        if (!approvedRef.current) return;
        if (!peersRef.current.has(data.socketId)) {
          createPeerConnection(data.socketId, false, localStreamRef.current || stream, {
            userData: data.userData,
            userId: data.userId
          });
        }
      });

      socketRef.current.on('receive-offer', (data: any) => {
        if (!approvedRef.current) return;
        const peer = peersRef.current.get(data.socketId)?.peer;
        if (!peer) {
          createPeerConnection(data.socketId, false, localStreamRef.current || stream, {
            hidden: Boolean(data.hidden),
          });
        }
        const connection = peersRef.current.get(data.socketId);
        if (connection && data.hidden) {
          connection.hidden = true;
        }
        if (connection) {
          connection.peer.signal(data.offer);
        }
      });

      socketRef.current.on('receive-answer', (data: any) => {
        if (!approvedRef.current) return;
        const connection = peersRef.current.get(data.socketId);
        if (connection) {
          connection.peer.signal(data.answer);
        }
      });

      socketRef.current.on('receive-ice-candidate', (data: any) => {
        if (!approvedRef.current) return;
        const connection = peersRef.current.get(data.socketId);
        if (connection) {
          connection.peer.signal(data.candidate);
        }
      });

      socketRef.current.on('user-left', (data: any) => {
        removePeerConnection(data.socketId);
        setRaisedHands((prev) => prev.filter((p) => p.socketId !== data.socketId));
        setUnmuteRequests((prev) => prev.filter((p) => p.socketId !== data.socketId));
      });

      socketRef.current.on('force-mute', () => {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
        setIsMicOn(false);
        setIsMutedByHost(true);
        setUnmuteRequested(false);
      });

      socketRef.current.on('allow-unmute', () => {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
        }
        setIsMicOn(true);
        setIsMutedByHost(false);
        setUnmuteRequested(false);
      });

      socketRef.current.on('unmute-denied', () => {
        setUnmuteRequested(false);
        setIsMutedByHost(true);
      });

      socketRef.current.on('force-video-off', () => {
        if (rawStreamRef.current && cameraVideoTrackRef.current) {
          applyVideoTrack(null);
          rawStreamRef.current.removeTrack(cameraVideoTrackRef.current);
          cameraVideoTrackRef.current.stop();
          cameraVideoTrackRef.current = null;
        }
        setIsCameraOn(false);
      });

      socketRef.current.on('disconnect', () => {
        console.log('[WebRTC] Disconnected from signaling server');
      });

      socketRef.current.on('error', (err) => {
        console.error('[Socket.IO Error]', err);
      });

      socketRef.current.on('auth-error', (data: any) => {
        setError(data?.message || 'Authentication failed for the meeting connection.');
      });
    };

    initializeSocket();

    return () => {
      peersRef.current.forEach((connection) => {
        connection.peer.destroy();
      });
      peersRef.current.clear();

      if (effectRafRef.current) {
        cancelAnimationFrame(effectRafRef.current);
        effectRafRef.current = null;
      }

      if (processedVideoTrackRef.current) {
        processedVideoTrackRef.current.stop();
        processedVideoTrackRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, userId, config.signalingServer, initializeLocalStream, createPeerConnection, removePeerConnection, cleanupRoom, applyVideoTrack]);

  const ensureSegmentation = useCallback(async () => {
    if (segmentationRef.current) return segmentationRef.current;

    const module = await import('@mediapipe/selfie_segmentation');
    const SelfieSegmentation = module.SelfieSegmentation;
    const segmentation = new SelfieSegmentation({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    segmentation.setOptions({ modelSelection: 1, selfieMode: true });
    segmentation.onResults((results: any) => {
      const canvas = effectCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const mode = backgroundModeRef.current;
      const bgImage = backgroundImageRef.current;

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Draw the person from the source image using the segmentation mask.
      ctx.drawImage(results.segmentationMask, 0, 0, width, height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(results.image, 0, 0, width, height);

      // Draw the background behind the person.
      ctx.globalCompositeOperation = 'destination-atop';
      if (mode === 'blur') {
        ctx.filter = 'blur(12px)';
        ctx.drawImage(results.image, 0, 0, width, height);
        ctx.filter = 'none';
      } else if (mode === 'image' && bgImage) {
        const scale = Math.max(width / bgImage.width, height / bgImage.height);
        const drawWidth = bgImage.width * scale;
        const drawHeight = bgImage.height * scale;
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;
        ctx.drawImage(bgImage, offsetX, offsetY, drawWidth, drawHeight);
      } else {
        ctx.drawImage(results.image, 0, 0, width, height);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    });

    segmentationRef.current = segmentation;
    return segmentation;
  }, []);

  const startBackgroundEffect = useCallback(async () => {
    if (!rawStreamRef.current || isScreenSharing) return;
    if (backgroundModeRef.current === 'none') return;
    if (backgroundModeRef.current === 'image' && !backgroundImageRef.current) return;

    const sourceStream = rawStreamRef.current;
    let video = effectVideoRef.current;
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = sourceStream;
      await video.play();
      effectVideoRef.current = video;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    let canvas = effectCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      effectCanvasRef.current = canvas;
    }
    canvas.width = width;
    canvas.height = height;

    const segmentation = await ensureSegmentation();

    if (!processedVideoTrackRef.current) {
      const processedStream = canvas.captureStream(30);
      processedVideoTrackRef.current = processedStream.getVideoTracks()[0] || null;
    }

    if (processedVideoTrackRef.current) {
      applyVideoTrack(processedVideoTrackRef.current);
    }

    const processFrame = async () => {
      if (!effectVideoRef.current || !segmentationRef.current) return;
      await segmentation.send({ image: effectVideoRef.current });
      effectRafRef.current = requestAnimationFrame(processFrame);
    };

    if (!effectRafRef.current) {
      effectRafRef.current = requestAnimationFrame(processFrame);
    }
  }, [applyVideoTrack, ensureSegmentation, isScreenSharing]);

  const stopBackgroundEffect = useCallback(() => {
    if (effectRafRef.current) {
      cancelAnimationFrame(effectRafRef.current);
      effectRafRef.current = null;
    }

    if (processedVideoTrackRef.current) {
      processedVideoTrackRef.current.stop();
      processedVideoTrackRef.current = null;
    }

    if (!isScreenSharing && cameraVideoTrackRef.current) {
      applyVideoTrack(cameraVideoTrackRef.current);
    }
  }, [applyVideoTrack, isScreenSharing]);

  useEffect(() => {
    backgroundModeRef.current = backgroundMode;

    if (backgroundMode === 'none') {
      stopBackgroundEffect();
      return;
    }

    if (isScreenSharing) {
      return;
    }

    if (backgroundMode === 'image' && !backgroundImageRef.current) {
      return;
    }

    startBackgroundEffect();
  }, [backgroundMode, isScreenSharing, startBackgroundEffect, stopBackgroundEffect]);

  const setBackgroundMode = useCallback((mode: BackgroundMode) => {
    setBackgroundModeState(mode);
  }, []);

  const setBackgroundImage = useCallback((dataUrl: string | null) => {
    setBackgroundImageState(dataUrl);
    if (!dataUrl) {
      backgroundImageRef.current = null;
      return;
    }

    const image = new Image();
    image.onload = () => {
      backgroundImageRef.current = image;
    };
    image.src = dataUrl;
  }, []);

  const stopScreenShare = useCallback(() => {
    if (!localStreamRef.current) return;
    const screenTrack = screenVideoTrackRef.current;
    if (!screenTrack) {
      setIsScreenSharing(false);
      return;
    }

    screenTrack.stop();
    screenVideoTrackRef.current = null;
    if (screenAudioTrackRef.current) {
      screenAudioTrackRef.current.stop();
      screenAudioTrackRef.current = null;
      if (micAudioTrackRef.current) {
        applyAudioTrack(micAudioTrackRef.current);
      }
    }
    setIsScreenSharing(false);

    if (backgroundModeRef.current !== 'none' && processedVideoTrackRef.current) {
      applyVideoTrack(processedVideoTrackRef.current);
      return;
    }

    if (cameraVideoTrackRef.current) {
      applyVideoTrack(cameraVideoTrackRef.current);
    }
  }, [applyAudioTrack, applyVideoTrack]);

  const startScreenShare = useCallback(async (includeDeviceAudio: boolean = false) => {
    if (!localStreamRef.current) return;

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: includeDeviceAudio,
    });
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) return;
    const screenAudioTrack = displayStream.getAudioTracks()[0] || null;

    if (backgroundModeRef.current !== 'none') {
      stopBackgroundEffect();
    }

    if (!cameraVideoTrackRef.current) {
      cameraVideoTrackRef.current = rawStreamRef.current?.getVideoTracks()[0] || null;
    }

    applyVideoTrack(screenTrack);
    if (includeDeviceAudio && screenAudioTrack) {
      applyAudioTrack(screenAudioTrack);
      screenAudioTrackRef.current = screenAudioTrack;
      setIsMicOn(screenAudioTrack.enabled);
    } else {
      screenAudioTrackRef.current = null;
    }
    screenVideoTrackRef.current = screenTrack;
    setIsScreenSharing(true);

    screenTrack.onended = () => {
      // User stopped sharing via browser UI.
      stopScreenShare();
    };
  }, [applyAudioTrack, applyVideoTrack, stopBackgroundEffect, stopScreenShare]);

  const toggleScreenShare = useCallback(async (includeDeviceAudio: boolean = false) => {
    try {
      if (isScreenSharing) {
        stopScreenShare();
        return;
      }
      await startScreenShare(includeDeviceAudio);
    } catch (err) {
      const isUserCancelled =
        (err instanceof DOMException && err.name === 'NotAllowedError') ||
        (err instanceof Error &&
          /permission denied|denied by user|not allowed/i.test(err.message));

      if (isUserCancelled) {
        setError(null);
        return;
      }

      const errorMessage = `Failed to start screen share: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      console.error(errorMessage);
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    if (!localStreamRef.current || !rawStreamRef.current) return;

    if (isCameraOn) {
      const currentCameraTrack = cameraVideoTrackRef.current;
      if (currentCameraTrack) {
        applyVideoTrack(null);
        rawStreamRef.current.removeTrack(currentCameraTrack);
        currentCameraTrack.stop();
      }
      cameraVideoTrackRef.current = null;

      if (processedVideoTrackRef.current) {
        processedVideoTrackRef.current.stop();
        processedVideoTrackRef.current = null;
      }
      if (effectRafRef.current) {
        cancelAnimationFrame(effectRafRef.current);
        effectRafRef.current = null;
      }

      setIsCameraOn(false);
      if (socketRef.current) {
        socketRef.current.emit('toggle-camera', { roomId, enabled: false });
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const nextTrack = stream.getVideoTracks()[0] || null;
      if (!nextTrack) {
        throw new Error('No video track available.');
      }

      cameraVideoTrackRef.current = nextTrack;
      rawStreamRef.current.addTrack(nextTrack);

      if (backgroundModeRef.current !== 'none' && !isScreenSharing) {
        if (effectVideoRef.current) {
          effectVideoRef.current.srcObject = rawStreamRef.current;
          await effectVideoRef.current.play().catch(() => undefined);
        }
        await startBackgroundEffect();
      } else {
        applyVideoTrack(nextTrack);
      }

      setIsCameraOn(true);
      setError(null);
      if (socketRef.current) {
        socketRef.current.emit('toggle-camera', { roomId, enabled: true });
      }
    } catch (err) {
      const errorMessage = `Failed to access camera: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      console.error(errorMessage);
    }
  }, [applyVideoTrack, isCameraOn, isScreenSharing, roomId, startBackgroundEffect]);

  // Toggle microphone
  const toggleMicrophone = useCallback(async () => {
    if (isMutedByHost) {
      setError('You are muted by the host. Request to unmute to turn your mic back on.');
      return;
    }
    if (!localStreamRef.current || !rawStreamRef.current) return;

    if (isMicOn) {
      const currentMicTrack = micAudioTrackRef.current;
      if (currentMicTrack) {
        if (!screenAudioTrackRef.current) {
          applyAudioTrack(null);
        }
        rawStreamRef.current.removeTrack(currentMicTrack);
        currentMicTrack.stop();
      }
      micAudioTrackRef.current = null;
      setIsMicOn(false);

      if (socketRef.current) {
        socketRef.current.emit('toggle-microphone', { roomId, enabled: false });
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const nextTrack = stream.getAudioTracks()[0] || null;
      if (!nextTrack) {
        throw new Error('No audio track available.');
      }

      micAudioTrackRef.current = nextTrack;
      rawStreamRef.current.addTrack(nextTrack);
      if (!screenAudioTrackRef.current) {
        applyAudioTrack(nextTrack);
      }

      setIsMicOn(true);
      setError(null);
      if (socketRef.current) {
        socketRef.current.emit('toggle-microphone', { roomId, enabled: true });
      }
    } catch (err) {
      const errorMessage = `Failed to access microphone: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      console.error(errorMessage);
    }
  }, [applyAudioTrack, isMicOn, roomId, isMutedByHost]);

  const switchCameraInput = useCallback(async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const nextTrack = stream.getVideoTracks()[0] || null;
      if (!nextTrack) {
        throw new Error('No video track available from the selected camera.');
      }

      nextTrack.enabled = isCameraOn;

      const previousCameraTrack = cameraVideoTrackRef.current;
      cameraVideoTrackRef.current = nextTrack;

      if (rawStreamRef.current && previousCameraTrack) {
        rawStreamRef.current.removeTrack(previousCameraTrack);
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.addTrack(nextTrack);
      }

      if (effectVideoRef.current && rawStreamRef.current) {
        effectVideoRef.current.srcObject = rawStreamRef.current;
        await effectVideoRef.current.play().catch(() => undefined);
      }

      if (!screenVideoTrackRef.current && backgroundModeRef.current === 'none') {
        applyVideoTrack(nextTrack);
      }

      previousCameraTrack?.stop();
      setError(null);
    } catch (err) {
      const errorMessage = `Failed to switch camera: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      console.error(errorMessage);
    }
  }, [applyVideoTrack, isCameraOn]);

  const switchMicrophoneInput = useCallback(async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const nextTrack = stream.getAudioTracks()[0] || null;
      if (!nextTrack) {
        throw new Error('No audio track available from the selected microphone.');
      }

      nextTrack.enabled = isMicOn;

      const previousMicTrack = micAudioTrackRef.current;
      micAudioTrackRef.current = nextTrack;

      if (rawStreamRef.current && previousMicTrack) {
        rawStreamRef.current.removeTrack(previousMicTrack);
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.addTrack(nextTrack);
      }

      if (!screenAudioTrackRef.current) {
        applyAudioTrack(nextTrack);
      }

      previousMicTrack?.stop();
      setError(null);
    } catch (err) {
      const errorMessage = `Failed to switch microphone: ${err instanceof Error ? err.message : String(err)}`;
      setError(errorMessage);
      console.error(errorMessage);
    }
  }, [applyAudioTrack, isMicOn]);

  const transferHost = useCallback((targetSocketId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('transfer-host', { roomId, targetSocketId });
  }, [roomId]);

  const endMeeting = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('end-meeting', { roomId });
  }, [roomId]);

  // Leave room
  const leaveRoom = useCallback(() => {
    cleanupRoom(true);
  }, [cleanupRoom]);

  // Send chat message
  const sendMessage = useCallback(
    (message: string) => {
      if (socketRef.current) {
        socketRef.current.emit('send-message', {
          roomId,
          message,
          senderName: 'You',
          timestamp: new Date().toISOString(),
        });
      }
    },
    [roomId]
  );

  return {
    localStream,
    peers,
    error,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    joinStatus,
    pendingRequests,
    isHost,
    unmuteRequests,
    isMutedByHost,
    unmuteRequested,
    raisedHands,
    isHandRaised,
    backgroundMode,
    backgroundImage,
    setBackgroundMode,
    setBackgroundImage,
    requestJoin,
    approveJoin,
    denyJoin,
    approveAll,
    hostMute,
    hostStopVideo,
    hostMuteAll,
    requestUnmute,
    approveUnmute,
    denyUnmute,
    transferHost,
    endMeeting,
    raiseHand,
    lowerHand,
    toggleCamera,
    toggleMicrophone,
    switchCameraInput,
    switchMicrophoneInput,
    toggleScreenShare,
    leaveRoom,
    meetingEnded,
    sendMessage,
  };
};
