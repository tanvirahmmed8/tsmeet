'use client';

import React from "react"

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Share2,
  MessageSquare,
  Users,
  Settings,
  Copy,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Sparkles,
  UserCheck,
  UserX,
  Hand,
  Crown,
  Volume2,
  GripVertical,
  Circle,
  Pause,
  Play,
  Square,
  Wifi,
} from 'lucide-react';

interface Participant {
  id: string;
  name: string;
  socketId: string;
}

type RecordingSessionStatus =
  | 'idle'
  | 'awaiting_recorder'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'failed';

type OutputCapableVideoElement = HTMLVideoElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function getSignalingServerUrl() {
  const url = process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:3002';
  return url.replace(/\/+$/, '');
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const userRaw = localStorage.getItem('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch (error) {
    console.warn('Ignoring invalid localStorage "user" value:', error);
    return null;
  }
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const autoRecordEnabled = searchParams.get('autoRecord') === '1';

  const [userId] = useState(() => {
    const user = getStoredUser();
    return String(user?.id ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`));
  });

  const [userName] = useState(() => {
    const user = getStoredUser();
    return String(user?.name ?? 'Guest');
  });

  const [hideSelf, setHideSelf] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null); // 'local' | peerId | null
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [hostPanelVisible, setHostPanelVisible] = useState(true);
  const [hostPanelCompact, setHostPanelCompact] = useState(false);
  const [hostPanelPosition, setHostPanelPosition] = useState({ x: 0, y: 0 });
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [displayName, setDisplayName] = useState(userName);
  const [needsName, setNeedsName] = useState(false);
  const [joinInitiated, setJoinInitiated] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [creatorChecked, setCreatorChecked] = useState(false);

  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('default');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('default');
  const [audioSettingsError, setAudioSettingsError] = useState<string | null>(null);
  const [videoSettingsError, setVideoSettingsError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localThumbRef = useRef<HTMLVideoElement>(null);
  const stageVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const recordingPollTimerRef = useRef<number | null>(null);
  const activeSpeakerRef = useRef<string | null>(null);
  const activeSpeakerLastSeenRef = useRef<number>(0);
  const hostPanelDraggingRef = useRef(false);
  const hostPanelDragOffsetRef = useRef({ x: 0, y: 0 });

  const [recordingStatus, setRecordingStatus] = useState<RecordingSessionStatus>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [showAutoRecordPrompt, setShowAutoRecordPrompt] = useState(false);
  const [autoRecordPromptHandled, setAutoRecordPromptHandled] = useState(false);
  const [shareWithDeviceAudio, setShareWithDeviceAudio] = useState(false);

  const {
    localStream,
    peers,
    error: webrtcError,
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
    isLowDataMode,
    setBackgroundMode,
    setBackgroundImage,
    setIsLowDataMode,
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
    leaveRoom: leaveWebRTC,
    meetingEnded,
  } = useWebRTC(roomId, userId, {
    signalingServer: getSignalingServerUrl(),
    userName,
  });

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (localThumbRef.current && localStream) {
      localThumbRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;

    const syncDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const nextMicrophones = devices.filter(
          (device) => device.kind === 'audioinput' && device.deviceId.trim() !== ''
        );
        const nextSpeakers = devices.filter(
          (device) => device.kind === 'audiooutput' && device.deviceId.trim() !== ''
        );
        const nextCameras = devices.filter(
          (device) => device.kind === 'videoinput' && device.deviceId.trim() !== ''
        );
        setMicrophoneDevices(nextMicrophones);
        setSpeakerDevices(nextSpeakers);
        setCameraDevices(nextCameras);

        const activeMicDeviceId = localStream.getAudioTracks()[0]?.getSettings().deviceId;
        const activeCameraDeviceId = localStream.getVideoTracks()[0]?.getSettings().deviceId;
        if (activeMicDeviceId) {
          setSelectedMicrophoneId(activeMicDeviceId);
        } else if (nextMicrophones.some((device) => device.deviceId === 'default')) {
          setSelectedMicrophoneId('default');
        } else if (nextMicrophones[0]?.deviceId) {
          setSelectedMicrophoneId(nextMicrophones[0].deviceId);
        }

        if (activeCameraDeviceId) {
          setSelectedCameraId(activeCameraDeviceId);
        } else if (nextCameras.some((device) => device.deviceId === 'default')) {
          setSelectedCameraId('default');
        } else if (nextCameras[0]?.deviceId) {
          setSelectedCameraId(nextCameras[0].deviceId);
        }

        if (!selectedSpeakerId) {
          if (nextSpeakers.some((device) => device.deviceId === 'default')) {
            setSelectedSpeakerId('default');
          } else if (nextSpeakers[0]?.deviceId) {
            setSelectedSpeakerId(nextSpeakers[0].deviceId);
          }
        }
      } catch (err) {
        console.error('Failed to enumerate audio devices:', err);
        setAudioSettingsError('Unable to load audio devices.');
        setVideoSettingsError('Unable to load camera devices.');
      }
    };

    syncDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', syncDevices);
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', syncDevices);
    };
  }, [localStream, selectedSpeakerId]);

  useEffect(() => {
    if (!selectedSpeakerId) return;
    const applySpeakerSelection = async () => {
      const videoNodes = Array.from(document.querySelectorAll('video')) as OutputCapableVideoElement[];
      await Promise.allSettled(
        videoNodes.map(async (node) => {
          if (typeof node.setSinkId !== 'function') return;
          await node.setSinkId(selectedSpeakerId);
        })
      );
    };

    applySpeakerSelection().catch((err) => {
      console.error('Failed to switch speaker output:', err);
      setAudioSettingsError('This browser does not allow changing speaker output here.');
    });
  }, [selectedSpeakerId, peers, pinnedId, localStream]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const guestName = typeof window !== 'undefined' ? localStorage.getItem('guestName') : null;

    if (!token) {
      setNeedsName(true);
      if (guestName && !displayName) {
        setDisplayName(guestName);
      }
      setCreatorChecked(true);
      return;
    }

    setNeedsName(false);
    const loadRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (String(data?.creator_id) === String(userId)) {
          setIsCreator(true);
        }
        setCreatorChecked(true);
      } catch (err) {
        console.error('Failed to load room data:', err);
        setCreatorChecked(true);
      }
    };

    loadRoom();
  }, [roomId, userId, displayName]);

  useEffect(() => {
    if (joinInitiated) return;
    if (!displayName.trim()) return;
    if (needsName) return;
    if (!creatorChecked) return;

    requestJoin({ userName: displayName.trim(), isHost: isCreator });
    setJoinInitiated(true);
  }, [displayName, needsName, isCreator, creatorChecked, joinInitiated, requestJoin]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!meetingEnded) return;
    router.push('/dashboard');
  }, [meetingEnded, router]);

  useEffect(() => {
    // If the pinned participant left, clear the pin.
    if (!pinnedId || pinnedId === 'local') return;
    if (!peers.some((p) => p.peerId === pinnedId)) {
      setPinnedId(null);
    }
  }, [pinnedId, peers]);

  useEffect(() => {
    if (pinnedId) return;

    const monitoredStreams: Array<{ id: string; stream: MediaStream }> = [];
    if (!hideSelf && localStream?.getAudioTracks().length) {
      monitoredStreams.push({ id: 'local', stream: localStream });
    }
    peers.forEach((peer) => {
      if (peer.stream?.getAudioTracks().length) {
        monitoredStreams.push({ id: peer.peerId, stream: peer.stream });
      }
    });

    if (monitoredStreams.length === 0) {
      activeSpeakerRef.current = null;
      setActiveSpeakerId(null);
      return;
    }

    const audioContext = new AudioContext();
    const analysers = monitoredStreams.map(({ id, stream }) => {
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      return {
        id,
        source,
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount),
      };
    });

    let rafId = 0;
    const threshold = 22;
    const holdMs = 1200;

    const sampleLevels = () => {
      const now = performance.now();
      let loudestId: string | null = null;
      let loudestLevel = 0;

      analysers.forEach((entry) => {
        entry.analyser.getByteFrequencyData(entry.data);
        const level = entry.data.reduce((sum, value) => sum + value, 0) / entry.data.length;
        if (level > loudestLevel) {
          loudestLevel = level;
          loudestId = entry.id;
        }
      });

      if (loudestId && loudestLevel >= threshold) {
        activeSpeakerLastSeenRef.current = now;
        if (activeSpeakerRef.current !== loudestId) {
          activeSpeakerRef.current = loudestId;
          setActiveSpeakerId(loudestId);
        }
      } else if (activeSpeakerRef.current && now - activeSpeakerLastSeenRef.current > holdMs) {
        activeSpeakerRef.current = null;
        setActiveSpeakerId(null);
      }

      rafId = window.requestAnimationFrame(sampleLevels);
    };

    sampleLevels();

    return () => {
      window.cancelAnimationFrame(rafId);
      analysers.forEach((entry) => {
        entry.source.disconnect();
        entry.analyser.disconnect();
      });
      audioContext.close().catch(() => undefined);
    };
  }, [pinnedId, hideSelf, localStream, peers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHostPanelPosition((current) => {
      if (current.x !== 0 || current.y !== 0) return current;
      return {
        x: Math.max(window.innerWidth - 520, 16),
        y: Math.max(window.innerHeight - 240, 120),
      };
    });
  }, []);

  useEffect(() => {
    const clampHostPanel = () => {
      const panelWidth = hostPanelCompact ? 240 : 360;
      const panelHeight = 140;
      setHostPanelPosition((current) => ({
        x: Math.min(Math.max(12, current.x), Math.max(12, window.innerWidth - panelWidth - 12)),
        y: Math.min(Math.max(84, current.y), Math.max(84, window.innerHeight - panelHeight - 12)),
      }));
    };

    clampHostPanel();
    window.addEventListener('resize', clampHostPanel);
    return () => {
      window.removeEventListener('resize', clampHostPanel);
    };
  }, [hostPanelCompact]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!hostPanelDraggingRef.current) return;
      const panelWidth = hostPanelCompact ? 240 : 360;
      const panelHeight = 140;
      const nextX = Math.min(
        Math.max(12, event.clientX - hostPanelDragOffsetRef.current.x),
        window.innerWidth - panelWidth - 12
      );
      const nextY = Math.min(
        Math.max(84, event.clientY - hostPanelDragOffsetRef.current.y),
        window.innerHeight - panelHeight - 12
      );
      setHostPanelPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      hostPanelDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [hostPanelCompact]);

  const getStageSelection = () => {
    if (pinnedId) {
      return pinnedId;
    }
    if (activeSpeakerId === 'local' && !hideSelf) {
      return 'local';
    }
    if (activeSpeakerId && peers.some((p) => p.peerId === activeSpeakerId)) {
      return activeSpeakerId;
    }
    if (!hideSelf) {
      return 'local';
    }
    return peers[0]?.peerId ?? null;
  };

  const stageSelection = getStageSelection();
  const pinnedPeer = stageSelection && stageSelection !== 'local'
    ? peers.find((p) => p.peerId === stageSelection)
    : undefined;
  const stageStream = stageSelection === 'local' ? localStream : pinnedPeer?.stream ?? null;
  const participantCount = peers.length + 1;
  const roomLabel = roomId.slice(0, 8);
  const stageLabel = pinnedId ? (stageSelection === 'local' ? 'You' : 'Pinned participant') : null;

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const pinLocal = () => setPinnedId('local');
  const pinPeer = (peerId: string) => setPinnedId(peerId);
  const unpin = () => setPinnedId(null);
  const startHostPanelDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    hostPanelDraggingRef.current = true;
    hostPanelDragOffsetRef.current = {
      x: event.clientX - hostPanelPosition.x,
      y: event.clientY - hostPanelPosition.y,
    };
    event.preventDefault();
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    const newMessage = {
      id: Date.now(),
      sender: 'You',
      text: messageInput,
      timestamp: new Date().toLocaleTimeString(),
    };

    setChatMessages([...chatMessages, newMessage]);
    setMessageInput('');

    // Emit via socket.io in full implementation
  };

  const leaveRoom = () => {
    leaveWebRTC();
    router.push('/dashboard');
  };

  const handleEndMeeting = () => {
    endMeeting();
  };

  const copyRoomLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
  };

  const handleBackgroundFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (result) {
        setBackgroundImage(result);
        setBackgroundMode('image');
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleBackgroundModeChange = (value: string) => {
    if (value === 'image' && !backgroundImage) {
      bgFileInputRef.current?.click();
    }
    setBackgroundMode(value as 'none' | 'blur' | 'image');
  };

  const handleMicrophoneSelect = async (deviceId: string) => {
    setSelectedMicrophoneId(deviceId);
    setAudioSettingsError(null);
    await switchMicrophoneInput(deviceId);
  };

  const handleSpeakerSelect = async (deviceId: string) => {
    setSelectedSpeakerId(deviceId);
    setAudioSettingsError(null);
  };

  const handleCameraSelect = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    setVideoSettingsError(null);
    await switchCameraInput(deviceId);
  };

  const selectedMicrophoneLabel =
    microphoneDevices.find((device) => device.deviceId === selectedMicrophoneId)?.label ||
    microphoneDevices[0]?.label ||
    'Microphone';
  const selectedMicrophoneValue = microphoneDevices.some(
    (device) => device.deviceId === selectedMicrophoneId
  )
    ? selectedMicrophoneId
    : undefined;
  const selectedSpeakerLabel =
    speakerDevices.find((device) => device.deviceId === selectedSpeakerId)?.label ||
    speakerDevices[0]?.label ||
    'Speakers';
  const selectedSpeakerValue = speakerDevices.some((device) => device.deviceId === selectedSpeakerId)
    ? selectedSpeakerId
    : undefined;
  const selectedCameraLabel =
    cameraDevices.find((device) => device.deviceId === selectedCameraId)?.label ||
    cameraDevices[0]?.label ||
    'Camera';
  const selectedCameraValue = cameraDevices.some((device) => device.deviceId === selectedCameraId)
    ? selectedCameraId
    : undefined;

  const submitGuestName = () => {
    if (!displayName.trim()) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('guestName', displayName.trim());
    }
    setNeedsName(false);
    requestJoin({ userName: displayName.trim(), isHost: false });
    setJoinInitiated(true);
  };

  const retryJoin = () => {
    if (!displayName.trim()) return;
    requestJoin({ userName: displayName.trim(), isHost: isCreator });
    setJoinInitiated(true);
  };

  const getAuthToken = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      throw new Error('You must be signed in to manage recording sessions.');
    }
    return token;
  };

  const fetchActiveRecordingSession = async () => {
    if (!isHost) return null;
    try {
      const response = await fetch(`${getSignalingServerUrl()}/api/recordings/rooms/${roomId}/active`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load recording session.');
      }

      const data = await response.json();
      const session = data?.session || null;
      recordingSessionIdRef.current = session?.id || null;
      setRecordingStatus(session?.status || 'idle');
      setRecordingError(session?.status === 'failed' ? session?.failureReason || 'Recorder service failed.' : null);
      return session;
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : 'Failed to load recording session.');
      return null;
    }
  };

  const postRecordingAction = async (
    path: string,
    body?: Record<string, string | boolean | null | undefined>
  ) => {
    const response = await fetch(`${getSignalingServerUrl()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Failed to update recording session.');
    }

    return response.json();
  };

  const startRecording = () => {
    if (!isHost) return;
    void (async () => {
      try {
        const session = await postRecordingAction('/api/recordings/sessions/start', { roomId });
        recordingSessionIdRef.current = session.id;
        setRecordingStatus(session.status || 'awaiting_recorder');
        setRecordingError(null);
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : 'Failed to start recording.');
      }
    })();
  };

  const pauseRecording = () => {
    if (!recordingSessionIdRef.current || recordingStatus !== 'recording') return;
    void (async () => {
      try {
        const session = await postRecordingAction(
          `/api/recordings/sessions/${recordingSessionIdRef.current}/pause`
        );
        setRecordingStatus(session.status || 'paused');
        setRecordingError(null);
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : 'Failed to pause recording.');
      }
    })();
  };

  const resumeRecording = () => {
    if (!recordingSessionIdRef.current || recordingStatus !== 'paused') return;
    void (async () => {
      try {
        const session = await postRecordingAction(
          `/api/recordings/sessions/${recordingSessionIdRef.current}/resume`
        );
        setRecordingStatus(session.status || 'recording');
        setRecordingError(null);
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : 'Failed to resume recording.');
      }
    })();
  };

  const stopRecording = () => {
    if (!recordingSessionIdRef.current || !['awaiting_recorder', 'recording', 'paused'].includes(recordingStatus)) {
      return;
    }
    void (async () => {
      try {
        const session = await postRecordingAction(
          `/api/recordings/sessions/${recordingSessionIdRef.current}/stop`
        );
        setRecordingStatus(session.status || 'stopping');
        setRecordingError(null);
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : 'Failed to stop recording.');
      }
    })();
  };

  useEffect(() => {
    if (!autoRecordEnabled || !isHost || joinStatus !== 'approved') return;
    if (autoRecordPromptHandled) return;
    if (recordingStatus !== 'idle') return;
    setShowAutoRecordPrompt(true);
  }, [autoRecordEnabled, isHost, joinStatus, recordingStatus, autoRecordPromptHandled]);

  useEffect(() => {
    if (!isHost || joinStatus !== 'approved') return;

    void fetchActiveRecordingSession();
    recordingPollTimerRef.current = window.setInterval(() => {
      void fetchActiveRecordingSession();
    }, 4000);

    return () => {
      if (recordingPollTimerRef.current !== null) {
        window.clearInterval(recordingPollTimerRef.current);
        recordingPollTimerRef.current = null;
      }
    };
  }, [isHost, joinStatus, roomId]);

  return (
    <div className="h-screen bg-[radial-gradient(circle_at_top,#12343b_0%,#0c1722_18%,#09111a_56%,#060c13_100%)] text-white flex flex-col overflow-hidden">
      <Dialog open={needsName} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Enter your name</DialogTitle>
            <DialogDescription>
              This meeting requires a display name. You can change it later.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />

          <DialogFooter>
            <Button onClick={submitGuestName} disabled={!displayName.trim()}>
              Join meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAutoRecordPrompt}
        onOpenChange={(open) => {
          setShowAutoRecordPrompt(open);
          if (!open) setAutoRecordPromptHandled(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start recording?</DialogTitle>
            <DialogDescription>
              This calendar has auto-record prompt enabled. You can start now or cancel and record later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoRecordPrompt(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                startRecording();
                setShowAutoRecordPrompt(false);
                setAutoRecordPromptHandled(true);
              }}
            >
              Start recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b border-white/10 bg-slate-950/65 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">TSMeet Room</h1>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
              {roomLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/50">
            {isHost ? 'You are hosting this meeting.' : 'Connected to the meeting workspace.'}
          </p>
        </div>

        <div className="flex items-center gap-2 text-white/72">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 rounded-full border border-white/10 bg-white/5 px-3 hover:bg-white/10 hover:text-white"
            onClick={copyRoomLink}
            title="Copy room link"
          >
            <Copy className="w-4 h-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-9 rounded-full border border-white/10 bg-white/5 px-3 hover:bg-white/10 hover:text-white"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 rounded-full border border-white/10 bg-white/5 px-3 hover:bg-white/10 hover:text-white"
                title="Participants"
              >
                <Users className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[360px] border-l border-white/10 bg-slate-950/96 text-white sm:w-[420px]"
            >
              <SheetHeader>
                <SheetTitle className="text-white">Participants ({peers.length + 1})</SheetTitle>
              </SheetHeader>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => setHideSelf((v) => !v)}
                >
                  {hideSelf ? (
                    <>
                      <Eye className="w-4 h-4 mr-2" /> Show My Tile
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" /> Hide My Tile
                    </>
                  )}
                </Button>

                {pinnedId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={unpin}
                  >
                    <PinOff className="w-4 h-4 mr-2" /> Unpin
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="h-[calc(100vh-170px)] mt-4 pr-3">
                <div className="space-y-2">
                  {isHost ? (
                    <Card className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-4 text-white shadow-none">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Host controls</p>
                        <p className="text-xs text-white/50">Moderate participants</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={hostMuteAll}
                      >
                        Mute all
                      </Button>
                    </Card>
                  ) : null}

                  {isHost && unmuteRequests.length > 0 ? (
                    <Card className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-white shadow-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Unmute requests</p>
                          <p className="text-xs text-white/50">
                            {unmuteRequests.length} waiting
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {unmuteRequests.map((req) => (
                          <div key={req.socketId} className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {req.userData?.name || 'Participant'}
                              </p>
                              <p className="text-xs text-white/35 truncate">{req.socketId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="rounded-full bg-primary px-3 hover:bg-primary/90"
                                onClick={() => approveUnmute(req.socketId)}
                              >
                                <UserCheck className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                onClick={() => denyUnmute(req.socketId)}
                              >
                                <UserX className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  {isHost && pendingRequests.length > 0 ? (
                    <Card className="rounded-3xl border border-primary/20 bg-primary/10 p-4 text-white shadow-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Join requests</p>
                          <p className="text-xs text-white/50">
                            {pendingRequests.length} waiting
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                          onClick={approveAll}
                        >
                          Accept all
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {pendingRequests.map((req) => (
                          <div key={req.socketId} className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {req.userData?.name || 'Guest'}
                              </p>
                              <p className="text-xs text-white/35 truncate">{req.socketId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="rounded-full bg-primary px-3 hover:bg-primary/90"
                                onClick={() => approveJoin(req.socketId)}
                              >
                                <UserCheck className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                                onClick={() => denyJoin(req.socketId)}
                              >
                                <UserX className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  <Card className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-4 text-white shadow-none">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">You</p>
                      <p className="text-xs text-white/50 truncate">{userName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHost ? (
                        <span className="text-xs text-emerald-300">Host</span>
                      ) : null}
                      {isHandRaised ? (
                        <span className="text-xs text-amber-300">Hand raised</span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={pinLocal}
                      >
                        <Pin className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>

                  {peers.map((p) => (
                    <Card
                      key={p.peerId}
                      className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-4 text-white shadow-none"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">Participant</p>
                        <p className="text-xs text-white/50 truncate">{p.peerId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {raisedHands.some((h) => h.socketId === p.peerId) ? (
                          <span className="text-xs text-amber-300">Hand raised</span>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                          onClick={() => pinPeer(p.peerId)}
                        >
                          <Pin className="w-4 h-4" />
                        </Button>
                        {isHost ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                              onClick={() => transferHost(p.peerId)}
                              title="Make host"
                            >
                              <Crown className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                              onClick={() => hostMute(p.peerId)}
                            >
                              <Mic className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                              onClick={() => hostStopVideo(p.peerId)}
                            >
                              <VideoOff className="w-4 h-4" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70">
            {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </div>
        </div>
      </header>

      {webrtcError && (
        <div className="px-4 pt-3">
          <div className="max-w-6xl mx-auto rounded-2xl border border-red-400/25 bg-red-500/10 p-3">
            <p className="text-sm text-red-200">{webrtcError}</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main Video Area */}
        <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start relative px-4 pb-4 pt-4 gap-4 overflow-hidden">
            {joinStatus !== 'approved' && !needsName && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="max-w-sm rounded-3xl border border-white/10 bg-slate-950/88 p-6 text-center shadow-2xl">
                  {joinStatus === 'pending' && (
                    <>
                      <h3 className="text-lg font-semibold">Waiting for approval</h3>
                      <p className="mt-2 text-sm text-white/65">
                        The host needs to approve your request to join.
                      </p>
                    </>
                  )}

                  {joinStatus === 'denied' && (
                    <>
                      <h3 className="text-lg font-semibold">Join request denied</h3>
                      <p className="mt-2 text-sm text-white/65">
                        The host denied your request. You can request again.
                      </p>
                      <div className="mt-4">
                        <Button onClick={retryJoin}>Request again</Button>
                      </div>
                    </>
                  )}

                  {joinStatus === 'idle' && (
                    <>
                      <h3 className="text-lg font-semibold">Connecting…</h3>
                      <p className="mt-2 text-sm text-white/65">
                        Preparing your connection.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          {/* Stage (Pinned) */}
          <div
            ref={stageRef}
            className={isFullscreen ? 'h-full w-full min-h-0' : 'mx-auto flex min-h-0 w-full max-w-7xl flex-1'}
          >
            <Card
              className={
                `w-full ${
                  isFullscreen
                    ? 'h-full'
                    : 'h-full min-h-[320px]'
                } relative overflow-hidden rounded-[28px] border border-white/10 bg-[#08101b] shadow-[0_30px_80px_-36px_rgba(0,0,0,0.9)]`
              }
            >
              {stageSelection === 'local' ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={(event) => {
                    stageVideoRef.current = event.currentTarget;
                  }}
                />
              ) : stageStream && stageStream.getVideoTracks().length > 0 ? (
                <video
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  ref={(el) => {
                    if (!el) return;
                    stageVideoRef.current = el;
                    if (el.srcObject !== stageStream) el.srcObject = stageStream;
                  }}
                />
              ) : pinnedPeer?.connected ? (
                <div className="w-full h-full bg-[#08101b]/82 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 mb-4">
                      <span className="text-4xl font-medium text-white/80">
                        {pinnedPeer.userData?.name?.charAt(0).toUpperCase() || 'G'}
                      </span>
                    </div>
                    <p className="text-lg font-medium text-white/80">{pinnedPeer.userData?.name || 'Guest'}</p>
                    <p className="mt-1 text-sm text-white/50">Camera is off</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-[#08101b] flex items-center justify-center">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-white/30 mx-auto mb-2" />
                    <p className="text-white/70">Connecting…</p>
                  </div>
                </div>
              )}

              <div className="absolute left-4 top-4 flex items-center gap-2">
                {stageLabel ? (
                  <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">
                    {stageLabel}
                  </div>
                ) : null}
                {stageSelection === 'local' && isScreenSharing ? (
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 backdrop-blur-md">
                    Screen sharing
                  </div>
                ) : null}
              </div>

              <div className="absolute top-4 right-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-10 rounded-full border border-white/10 bg-black/35 px-3 text-white hover:bg-black/55"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>

                {pinnedId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 rounded-full border border-white/10 bg-black/35 px-3 text-white hover:bg-black/55"
                    onClick={unpin}
                    title="Unpin"
                  >
                    <PinOff className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>

              {stageSelection === 'local' && !isCameraOn && !isScreenSharing ? (
                <div className="absolute inset-0 bg-[#08101b]/82 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                      <VideoOff className="w-8 h-8 text-white/45" />
                    </div>
                    <p className="text-lg font-medium text-white/80">Camera is off</p>
                    <p className="mt-1 text-sm text-white/50">Turn video on when you are ready.</p>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Filmstrip */}
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => setHideSelf((v) => !v)}
              >
                {hideSelf ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                {hideSelf ? 'Show me' : 'Hide me'}
              </Button>

              {pinnedId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={unpin}
                >
                  <PinOff className="w-4 h-4 mr-2" /> Unpin
                </Button>
              ) : null}
            </div>

            <div className="text-xs uppercase tracking-[0.18em] text-white/45">
              Filmstrip
            </div>
          </div>

          <div className="mx-auto w-full max-w-7xl shrink-0">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {!hideSelf && (
                <Card
                  className="relative aspect-video w-56 shrink-0 cursor-pointer overflow-hidden rounded-[22px] border border-white/10 bg-[#08101b]"
                  onClick={pinLocal}
                >
                  <video
                    ref={localThumbRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-xs text-white backdrop-blur-md">
                    You
                  </div>
                  {pinnedId === 'local' ? (
                    <div className="absolute top-3 right-3 rounded-full border border-white/10 bg-black/45 p-1.5 text-white">
                      <Pin className="w-3.5 h-3.5" />
                    </div>
                  ) : null}
                </Card>
              )}

              {peers.map((peerConn, index) => {
                const stream = peerConn.stream;
                return (
                  <Card
                    key={peerConn.peerId}
                    className="relative aspect-video w-56 shrink-0 cursor-pointer overflow-hidden rounded-[22px] border border-white/10 bg-[#08101b]"
                    onClick={() => pinPeer(peerConn.peerId)}
                  >
                    {stream && stream.getVideoTracks().length > 0 ? (
                      <video
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        ref={(el) => {
                          if (!el) return;
                          if (el.srcObject !== stream) el.srcObject = stream;
                        }}
                      />
                    ) : peerConn.connected ? (
                      <div className="w-full h-full bg-[#08101b] flex flex-col items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 mb-2">
                          <span className="text-xl font-medium text-white/80">
                            {peerConn.userData?.name?.charAt(0).toUpperCase() || 'G'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-[#08101b] flex items-center justify-center">
                        <p className="text-white/70 text-sm">Connecting…</p>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-xs text-white backdrop-blur-md max-w-[calc(100%-24px)] truncate">
                      {peerConn.userData?.name || `Guest ${index + 1}`}
                    </div>

                    {pinnedId === peerConn.peerId ? (
                      <div className="absolute top-3 right-3 rounded-full border border-white/10 bg-black/45 p-1.5 text-white">
                        <Pin className="w-3.5 h-3.5" />
                      </div>
                    ) : null}
                  </Card>
                );
              })}

              {hideSelf && peers.length === 0 ? (
                <div className="shrink-0 h-[126px] flex items-center px-2">
                  <p className="text-white/60 text-sm">Waiting for participants…</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <Card className="w-80 border-l border-white/10 bg-slate-950/72 backdrop-blur-xl flex flex-col rounded-none text-white">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h3 className="font-semibold">Chat</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowChat(false)}
                className="text-white/55 hover:text-white"
              >
                ×
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <p className="text-center text-sm text-white/45">No messages yet</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{msg.sender}</span>
                      <span className="text-xs text-white/35">{msg.timestamp}</span>
                    </div>
                    <p className="break-words text-white/68">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-4">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/35"
              />
              <Button
                type="submit"
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Send
              </Button>
            </form>
          </Card>
        )}
      </div>

      {isHost && hostPanelVisible ? (
        <div
          className="fixed z-[95] select-none"
          style={{ left: `${hostPanelPosition.x}px`, top: `${hostPanelPosition.y}px` }}
        >
          <div className="rounded-[28px] border border-white/10 bg-slate-950/92 p-3 shadow-[0_24px_64px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div
              className="mb-3 flex cursor-move items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2"
              onMouseDown={startHostPanelDrag}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-white/45" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">Host</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-2 text-white/65 hover:bg-white/10 hover:text-white"
                  onClick={() => setHostPanelCompact((current) => !current)}
                  title={hostPanelCompact ? 'Expand host controls' : 'Compact host controls'}
                >
                  {hostPanelCompact ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-full px-2 text-white/65 hover:bg-white/10 hover:text-white"
                  onClick={() => setHostPanelVisible(false)}
                  title="Hide host controls"
                >
                  <EyeOff className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className={`flex flex-wrap items-center gap-2 ${hostPanelCompact ? 'max-w-[210px]' : 'max-w-[360px]'}`}>
              {recordingStatus === 'idle' ? (
                <Button
                  onClick={startRecording}
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-full border-white/10 bg-transparent px-4 text-white/85 hover:bg-white/10 hover:text-white"
                >
                  <Circle className="w-4 h-4 mr-2 text-red-500" />
                  Start recording
                </Button>
              ) : null}

              {recordingStatus === 'awaiting_recorder' ? (
                <Button size="lg" variant="outline" className="h-11 rounded-full border-amber-400/25 bg-amber-500/10 px-4 text-amber-100" disabled>
                  Waiting for recorder
                </Button>
              ) : null}

              {recordingStatus === 'recording' ? (
                <Button onClick={pauseRecording} size="lg" variant="outline" className="h-11 rounded-full border-white/10 bg-transparent px-4 text-white/85 hover:bg-white/10 hover:text-white">
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              ) : null}

              {recordingStatus === 'paused' ? (
                <Button onClick={resumeRecording} size="lg" variant="outline" className="h-11 rounded-full border-white/10 bg-transparent px-4 text-white/85 hover:bg-white/10 hover:text-white">
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              ) : null}

              {recordingStatus === 'stopping' ? (
                <Button size="lg" variant="outline" className="h-11 rounded-full border-white/10 bg-transparent px-4 text-white/70" disabled>
                  Stopping recorder...
                </Button>
              ) : null}

              {['awaiting_recorder', 'recording', 'paused'].includes(recordingStatus) ? (
                <Button onClick={stopRecording} size="lg" variant="outline" className="h-11 rounded-full border-white/10 bg-transparent px-4 text-white/85 hover:bg-white/10 hover:text-white">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isHost && !hostPanelVisible ? (
        <div className="fixed bottom-24 right-4 z-[95]">
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full border-white/10 bg-slate-950/92 px-4 text-white/85 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl hover:bg-white/10 hover:text-white"
            onClick={() => setHostPanelVisible(true)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Show host controls
          </Button>
        </div>
      ) : null}

      {/* Control Bar */}
      <div className="border-t border-white/10 bg-slate-950/72 px-4 py-4 backdrop-blur-xl">
        {videoSettingsOpen ? (
          <div className="mx-auto mb-3 flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-[28px] border border-white/10 bg-white/5 px-3 py-3 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.7)]">
            <div className="min-w-[240px] flex-1">
              <Select value={selectedCameraValue} onValueChange={handleCameraSelect}>
                <SelectTrigger className="h-12 w-full rounded-full border-white/10 bg-transparent text-white" title={selectedCameraLabel}>
                  <div className="flex min-w-0 items-center gap-2">
                    <VideoIcon className="w-4 h-4 text-white/70" />
                    <SelectValue placeholder="Select camera" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-slate-950 text-white">
                  {cameraDevices.length > 0 ? (
                    cameraDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 6)}`}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-white/60">
                      Turn camera on to load available devices.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              size="lg"
              variant={backgroundMode === 'blur' ? 'default' : 'outline'}
              className={backgroundMode === 'blur' ? 'rounded-full bg-primary hover:bg-primary/90' : 'rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'}
              onClick={() => setBackgroundMode(backgroundMode === 'blur' ? 'none' : 'blur')}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Blur background
            </Button>

            <Button
              type="button"
              size="lg"
              variant={isLowDataMode ? 'default' : 'outline'}
              className={isLowDataMode ? 'rounded-full bg-amber-500 hover:bg-amber-600 text-white' : 'rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'}
              onClick={async () => {
                setIsLowDataMode(!isLowDataMode);
                if (isCameraOn) {
                  await toggleCamera();
                }
              }}
              title="Lower video resolution to save bandwidth"
            >
              <Wifi className="w-4 h-4 mr-2" />
              Low Data Mode
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="lg" variant="outline" className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white">
                  Backgrounds and effects
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuLabel>Background</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={backgroundMode} onValueChange={handleBackgroundModeChange}>
                  <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="blur">Blur</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="image">Image</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => bgFileInputRef.current?.click()}>
                  <ImageIcon className="w-4 h-4" />
                  Set background image…
                </DropdownMenuItem>
                {backgroundImage ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setBackgroundImage(null);
                      setBackgroundMode('none');
                    }}
                  >
                    Clear background image
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="lg"
              variant="ghost"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setVideoSettingsOpen(false)}
              title="Collapse video settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        ) : null}

        {audioSettingsOpen ? (
          <div className="mx-auto mb-3 flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-[28px] border border-white/10 bg-white/5 px-3 py-3 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.7)]">
            <div className="min-w-[240px] flex-1">
              <Select value={selectedMicrophoneValue} onValueChange={handleMicrophoneSelect}>
                <SelectTrigger className="h-12 w-full rounded-full border-white/10 bg-transparent text-white" title={selectedMicrophoneLabel}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Mic className="w-4 h-4 text-white/70" />
                    <SelectValue placeholder="Select microphone" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-slate-950 text-white">
                  {microphoneDevices.length > 0 ? (
                    microphoneDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-white/60">
                      Turn microphone on to load available devices.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[240px] flex-1">
              <Select value={selectedSpeakerValue} onValueChange={handleSpeakerSelect}>
                <SelectTrigger className="h-12 w-full rounded-full border-white/10 bg-transparent text-white" title={selectedSpeakerLabel}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Volume2 className="w-4 h-4 text-white/70" />
                    <SelectValue placeholder="Select speakers" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-slate-950 text-white">
                  {speakerDevices.length > 0 ? (
                    speakerDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Speaker ${device.deviceId.slice(0, 6)}`}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-white/60">
                      Enable audio to load speaker outputs.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              size="lg"
              variant="ghost"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setAudioSettingsOpen(false)}
              title="Collapse audio settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        ) : null}

        {(audioSettingsError || videoSettingsError || recordingError) ? (
          <div className="mx-auto mb-3 w-full max-w-4xl">
            {audioSettingsError ? (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {audioSettingsError}
              </div>
            ) : null}
            {videoSettingsError ? (
              <div className="mt-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {videoSettingsError}
              </div>
            ) : null}
            {recordingError ? (
              <div className="mt-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {recordingError}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-4">
          <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/5 px-3 py-2.5">
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-white/45 md:inline">
              Devices
            </span>
            <Button
            onClick={() => setAudioSettingsOpen((current) => !current)}
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white"
            title={audioSettingsOpen ? 'Hide audio settings' : 'Show audio settings'}
          >
            {audioSettingsOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </Button>

          <Button
            onClick={toggleMicrophone}
            size="lg"
            variant={isMicOn ? 'default' : 'destructive'}
            className={isMicOn ? 'h-12 rounded-full bg-primary px-4 hover:bg-primary/90' : 'h-12 rounded-full bg-destructive px-4 hover:bg-destructive/90'}
            disabled={isMutedByHost}
            title={selectedMicrophoneLabel}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>

        {isMutedByHost ? (
          <Button
            onClick={requestUnmute}
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-white/10 bg-white/5 px-4 text-white/80 hover:bg-white/10 hover:text-white"
            disabled={unmuteRequested}
          >
            {unmuteRequested ? 'Requested' : 'Request to unmute'}
          </Button>
        ) : null}

          <Button
            onClick={() => setVideoSettingsOpen((current) => !current)}
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white"
            title={videoSettingsOpen ? 'Hide video settings' : 'Show video settings'}
          >
            {videoSettingsOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </Button>

          <Button
          onClick={toggleCamera}
          size="lg"
          variant={isCameraOn ? 'default' : 'destructive'}
          className={isCameraOn ? 'h-12 rounded-full bg-primary px-4 hover:bg-primary/90' : 'h-12 rounded-full bg-destructive px-4 hover:bg-destructive/90'}
          title={selectedCameraLabel}
        >
          {isCameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>
          </div>

          <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/5 px-3 py-2.5">
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-white/45 md:inline">
              Meeting
            </span>
            <Button
              onClick={() => toggleScreenShare(shareWithDeviceAudio)}
              size="lg"
              variant={isScreenSharing ? 'default' : 'outline'}
              className={isScreenSharing ? 'h-12 rounded-full bg-primary px-4 hover:bg-primary/90' : 'h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white'}
              title={shareWithDeviceAudio ? 'Share screen with device audio' : 'Share screen only'}
            >
              <Share2 className="w-5 h-5" />
            </Button>

            <Button
              onClick={() => setShareWithDeviceAudio((prev) => !prev)}
              size="lg"
              variant={shareWithDeviceAudio ? 'default' : 'outline'}
              className={shareWithDeviceAudio ? 'h-12 rounded-full bg-primary px-4 hover:bg-primary/90' : 'h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white'}
              disabled={isScreenSharing}
              title="Include device audio while screen sharing"
            >
              <Volume2 className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">System audio</span>
            </Button>

            <Button
              onClick={isHandRaised ? lowerHand : raiseHand}
              size="lg"
              variant={isHandRaised ? 'default' : 'outline'}
              className={isHandRaised ? 'h-12 rounded-full bg-amber-500 px-4 text-white hover:bg-amber-600' : 'h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white'}
              title={isHandRaised ? 'Lower hand' : 'Raise hand'}
            >
              <Hand className="w-5 h-5" />
            </Button>

            <Button
              onClick={() => setShowChat(!showChat)}
              size="lg"
              variant={showChat ? 'default' : 'outline'}
              className={showChat ? 'h-12 rounded-full bg-primary px-4 hover:bg-primary/90' : 'h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white'}
            >
              <MessageSquare className="w-5 h-5" />
            </Button>

            <Button
              onClick={toggleFullscreen}
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-white/10 bg-transparent px-4 text-white/80 hover:bg-white/10 hover:text-white"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
          </div>

          {isHost ? (
            <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/5 px-3 py-2.5">
              <Button
                onClick={handleEndMeeting}
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-red-400/35 bg-red-500/10 px-5 text-red-100 hover:bg-red-500/18"
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                End meeting
              </Button>

              <Button
                onClick={leaveRoom}
                size="lg"
                className="h-12 rounded-full bg-red-600 px-5 text-white shadow-[0_14px_28px_-18px_rgba(220,38,38,0.9)] hover:bg-red-500"
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                Leave
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/5 px-3 py-2.5">
              <Button
                onClick={leaveRoom}
                size="lg"
                className="h-12 rounded-full bg-red-600 px-5 text-white shadow-[0_14px_28px_-18px_rgba(220,38,38,0.9)] hover:bg-red-500"
              >
                <PhoneOff className="w-5 h-5 mr-2" />
                Leave
              </Button>
            </div>
          )}
        </div>
      </div>

      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBackgroundFile}
      />
      {recordingError ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {recordingError}
        </div>
      ) : null}
    </div>
  );
}
