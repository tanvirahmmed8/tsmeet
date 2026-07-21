'use client';

import React from "react"

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMeetingMedia, type MeetingMediaProvider } from '@/hooks/useMeetingMedia';
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
  Signal,
  Shield,
  ShieldOff,
  Lock,
  LockOpen,
  UserMinus,
  Search,
  MoreHorizontal,
  UserPlus,
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
    const [hostPanelCompact, setHostPanelCompact] = useState(false);
  const [hostPanelPosition, setHostPanelPosition] = useState({ x: 0, y: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);
  const [displayName, setDisplayName] = useState(userName);
  const [needsName, setNeedsName] = useState(false);
  const [joinInitiated, setJoinInitiated] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [creatorChecked, setCreatorChecked] = useState(false);
  const [mediaProvider, setMediaProvider] = useState<MeetingMediaProvider>(null);

  const [activeSidebarTab, setActiveSidebarTab] = useState<"chat" | "participants" | "host" | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
    const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
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
  const [showRecordingConsent, setShowRecordingConsent] = useState(false);

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
    networkQuality,
    coHosts,
    promoteToCoHost,
    demoteFromCoHost,
    setBackgroundMode,
    setBackgroundImage,
    setIsLowDataMode,
    setParticipantVideoQuality,
    removeParticipant,
    isMeetingLocked,
    setMeetingLocked,
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
  } = useMeetingMedia(mediaProvider, roomId, userId, {
    signalingServer: getSignalingServerUrl(),
    userName,
    pinnedParticipantId: pinnedId,
    activeSpeakerId,
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
    const storedUser = getStoredUser();
    const guestName = typeof window !== 'undefined' ? localStorage.getItem('guestName') : null;

    if (!storedUser) {
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
        });
        if (!res.ok) return;
        const data = await res.json();
        setMediaProvider(data?.media_provider === 'mesh' ? 'mesh' : 'livekit');
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
    if (!creatorChecked || !mediaProvider) return;

    requestJoin({ userName: displayName.trim(), isHost: isCreator });
    setJoinInitiated(true);
  }, [displayName, needsName, isCreator, creatorChecked, joinInitiated, mediaProvider, requestJoin]);

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
  const stageStream = stageSelection === 'local'
    ? localStream
    : pinnedPeer?.screenStream ?? pinnedPeer?.stream ?? null;
  const participantCount = peers.length + 1;
  const normalizedParticipantSearch = participantSearch.trim().toLowerCase();
  const filteredPeers = (normalizedParticipantSearch
    ? peers.filter((peer) => (peer.userData?.name || 'Participant').toLowerCase().includes(normalizedParticipantSearch))
    : peers
  ).slice().sort((a, b) =>
    Number(raisedHands.some((hand) => hand.socketId === b.peerId)) - Number(raisedHands.some((hand) => hand.socketId === a.peerId))
  );
  const showLocalParticipant = !normalizedParticipantSearch
    || 'you'.includes(normalizedParticipantSearch)
    || userName.toLowerCase().includes(normalizedParticipantSearch);
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
    return '';
  };

  const fetchActiveRecordingSession = async () => {
    if (!isHost) return null;
    try {
      const response = await fetch(`/api/recordings/rooms/${roomId}/active`, {
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
    const response = await fetch(path, {
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
    setShowRecordingConsent(true);
  };

  const confirmStartRecording = () => {
    if (!isHost) return;
    setShowRecordingConsent(false);
    void (async () => {
      try {
        const session = await postRecordingAction('/api/recordings/sessions/start', { roomId, consentConfirmed: true });
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

      <Dialog open={showRecordingConsent} onOpenChange={setShowRecordingConsent}>
        <DialogContent className="max-w-md overflow-hidden border-white/10 bg-[#0d1320] p-0 text-white shadow-2xl">
          <div className="border-b border-white/10 bg-gradient-to-br from-red-500/10 via-transparent to-transparent px-6 pb-5 pt-6">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-red-400/25 bg-red-500/10">
              <Circle className="h-5 w-5 fill-red-500 text-red-500" />
            </div>
            <DialogHeader className="text-left">
              <DialogTitle className="text-xl text-white">Start recording?</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-white/55">
                Everyone in the meeting will see a recording indicator while recording is active.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-3 px-6 py-5">
            <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div>
                <p className="text-sm font-medium">Confirm participant consent</p>
                <p className="mt-1 text-xs leading-5 text-white/45">Only continue after required consent has been obtained from meeting participants.</p>
              </div>
            </div>
            <p className="text-xs text-white/35">The recording can be paused or stopped from the Record menu.</p>
          </div>

          <DialogFooter className="flex-row justify-end gap-2 border-t border-white/10 bg-black/10 px-6 py-4 sm:space-x-0">
            <Button variant="ghost" className="rounded-xl text-white/65 hover:bg-white/10 hover:text-white" onClick={() => setShowRecordingConsent(false)}>Cancel</Button>
            <Button className="rounded-xl bg-red-600 px-5 text-white hover:bg-red-500" onClick={confirmStartRecording}>
              <Circle className="mr-2 h-4 w-4 fill-current" /> Start recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">TSMeet Room</h1>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
              {roomLabel}
            </span>
          </div>
          <p className="mt-0.5 hidden text-xs text-white/50 sm:block">
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

          <Sheet open={(activeSidebarTab === "participants")} onOpenChange={(v) => setActiveSidebarTab(v ? "participants" : null)}>
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
              className="flex w-full flex-col border-l border-white/10 bg-[#090d18]/98 p-0 text-white sm:w-[400px] sm:max-w-[400px] [&_[data-slot=sheet-close]]:text-white/65 [&_[data-slot=sheet-close]]:hover:text-white"
            >
              <SheetHeader className="border-b border-white/10 px-5 py-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  Participants
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/65">{participantCount}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-3 border-b border-white/10 px-4 py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    value={participantSearch}
                    onChange={(event) => setParticipantSearch(event.target.value)}
                    placeholder="Search participants"
                    className="h-10 rounded-xl border-white/10 bg-white/[0.06] pl-9 text-sm text-white placeholder:text-white/35"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1 rounded-xl border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/10 hover:text-white"
                    onClick={copyRoomLink}
                  >
                    <UserPlus className="mr-2 h-4 w-4" /> Invite
                  </Button>
                  {isHost ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 rounded-xl border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/10 hover:text-white"
                      onClick={hostMuteAll}
                    >
                      <MicOff className="mr-2 h-4 w-4" /> Mute all
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg px-2 text-xs text-white/55 hover:bg-white/10 hover:text-white"
                  onClick={() => setHideSelf((v) => !v)}
                >
                  {hideSelf ? (
                    <>
                      <Eye className="mr-2 h-3.5 w-3.5" /> Show my tile
                    </>
                  ) : (
                    <>
                      <EyeOff className="mr-2 h-3.5 w-3.5" /> Hide my tile
                    </>
                  )}
                </Button>

                {pinnedId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg border-white/10 bg-white/5 px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={unpin}
                  >
                    <PinOff className="w-4 h-4 mr-2" /> Unpin
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="mt-2 min-h-0 flex-1 px-4 pb-4">
                <div className="space-y-2">

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

                  {(isHost || coHosts.has(userId)) && pendingRequests.length > 0 ? (
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

                  {showLocalParticipant ? (
                    <div className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.06]">
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 text-sm font-semibold">
                        {userName.charAt(0).toUpperCase() || 'Y'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{userName} <span className="text-white/45">(You)</span></p>
                          {isHost ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">HOST</span> : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-white/40">{isHandRaised ? 'Hand raised' : isMicOn ? 'Microphone on' : 'Muted'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isHandRaised ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-300" title="Hand raised"><Hand className="h-4 w-4" /></span> : null}
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${isMicOn ? 'text-white/55' : 'bg-red-500/10 text-red-300'}`}>
                          {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                        </span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/55 hover:bg-white/10 hover:text-white" onClick={pinnedId === 'local' ? unpin : pinLocal} title={pinnedId === 'local' ? 'Unpin' : 'Pin'}>
                          {pinnedId === 'local' ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {filteredPeers.map((p) => (
                    <div
                      key={p.peerId}
                      className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.06]"
                    >
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-700 text-sm font-semibold">
                        {p.userData?.name?.charAt(0).toUpperCase() || 'G'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.userData?.name || 'Participant'}</p>
                        <p className="mt-0.5 truncate text-xs text-white/40">
                          {coHosts.has(p.userId || '') ? 'Co-host' : raisedHands.some((hand) => hand.socketId === p.peerId) ? 'Hand raised' : 'In the meeting'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {raisedHands.some((hand) => hand.socketId === p.peerId) ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-300" title="Hand raised"><Hand className="h-4 w-4" /></span> : null}
                        <Select
                          defaultValue="medium"
                          onValueChange={(quality) =>
                            setParticipantVideoQuality(
                              p.peerId,
                              quality as 'high' | 'medium' | 'low' | 'off'
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[68px] rounded-lg border-white/10 bg-white/5 text-[11px] text-white">
                            <SelectValue aria-label="Video quality" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">720p</SelectItem>
                            <SelectItem value="medium">360p</SelectItem>
                            <SelectItem value="low">180p</SelectItem>
                            <SelectItem value="off">Off</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-full text-white/55 hover:bg-white/10 hover:text-white"
                          onClick={pinnedId === p.peerId ? unpin : () => pinPeer(p.peerId)}
                          title={pinnedId === p.peerId ? 'Unpin' : 'Pin'}
                        >
                          {pinnedId === p.peerId ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </Button>
                        {isHost ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/55 hover:bg-white/10 hover:text-white" title="Participant actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onSelect={() => hostMute(p.peerId)}><MicOff className="h-4 w-4" /> Mute participant</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => hostStopVideo(p.peerId)}><VideoOff className="h-4 w-4" /> Stop video</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => transferHost(p.peerId)}><Crown className="h-4 w-4" /> Make host</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => coHosts.has(p.userId || '') ? demoteFromCoHost(p.peerId) : promoteToCoHost(p.peerId)}>
                                {coHosts.has(p.userId || '') ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                                {coHosts.has(p.userId || '') ? 'Remove co-host' : 'Make co-host'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-400 focus:text-red-300" onSelect={() => removeParticipant(p.peerId)}><UserMinus className="h-4 w-4" /> Remove from meeting</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {!showLocalParticipant && filteredPeers.length === 0 ? (
                    <div className="py-12 text-center text-sm text-white/40">No participants found</div>
                  ) : null}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 sm:block">
            {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </div>
          <div
            className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 lg:block"
            title="LiveKit connection quality"
          >
            Network: {networkQuality}
          </div>
          {isHost ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              onClick={() => setMeetingLocked(!isMeetingLocked)}
            >
              {isMeetingLocked ? <Lock className="mr-2 h-4 w-4" /> : <LockOpen className="mr-2 h-4 w-4" />}
              {isMeetingLocked ? 'Locked' : 'Lock meeting'}
            </Button>
          ) : null}
        </div>
      </header>

      {webrtcError && (
        <div className="px-4 pt-3">
          <div className="max-w-6xl mx-auto rounded-2xl border border-red-400/25 bg-red-500/10 p-3">
            <p className="text-sm text-red-200">{webrtcError}</p>
          </div>
        </div>
      )}

      {!webrtcError && (networkQuality === 'Poor' || networkQuality === 'Critical') ? (
        <div className="pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2 px-3">
          <div className="flex items-center gap-2 rounded-full border border-amber-400/25 bg-slate-950/90 px-3 py-2 text-xs text-amber-100 shadow-xl backdrop-blur-xl">
            <Signal className="h-4 w-4" />
            {networkQuality === 'Critical' ? 'Very weak network · audio prioritized' : 'Unstable network · video quality reduced'}
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex overflow-hidden">
        {/* Main Video Area */}
        <div className="relative flex min-h-0 flex-1 flex-col items-stretch justify-start gap-3 overflow-hidden p-3 sm:p-4">
            {joinStatus !== 'approved' && !needsName && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl">
                <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 items-center justify-center p-8">
                  {/* Camera Preview */}
                  <div className="w-full max-w-2xl aspect-video rounded-3xl overflow-hidden bg-black/60 relative border border-white/10 shadow-2xl">
                    <video
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover -scale-x-100"
                      ref={(el) => {
                        if (el && localStream && el.srcObject !== localStream) {
                          el.srcObject = localStream;
                        }
                      }}
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                      <Button
                        size="icon"
                        variant={isMicOn ? 'default' : 'destructive'}
                        className="rounded-full h-12 w-12"
                        onClick={toggleMicrophone}
                      >
                        {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant={isCameraOn ? 'default' : 'destructive'}
                        className="rounded-full h-12 w-12"
                        onClick={toggleCamera}
                      >
                        {isCameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Controls Area */}
                  <div className="flex flex-col gap-6 w-full max-w-sm bg-slate-900/50 p-6 rounded-3xl border border-white/10">
                    <h2 className="text-2xl font-bold">Ready to join?</h2>

                    {joinStatus === 'password-required' && (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-white/70">Meeting Password</label>
                        <Input
                          type="password"
                          placeholder="Enter password"
                          value={roomPassword}
                          onChange={(e) => setRoomPassword(e.target.value)}
                          className="bg-black/40 border-white/10"
                        />
                        <Button className="w-full rounded-xl bg-primary hover:bg-primary/90" onClick={retryJoin}>
                          Submit Password
                        </Button>
                      </div>
                    )}

                    {joinStatus === 'password-incorrect' && (
                      <div className="flex flex-col gap-2">
                        <p className="text-red-400 text-sm">Incorrect password. Please try again.</p>
                        <Input
                          type="password"
                          placeholder="Enter password"
                          value={roomPassword}
                          onChange={(e) => setRoomPassword(e.target.value)}
                          className="bg-black/40 border-red-500/50"
                        />
                        <Button className="w-full rounded-xl bg-primary hover:bg-primary/90" onClick={retryJoin}>
                          Submit Password
                        </Button>
                      </div>
                    )}

                    {joinStatus === 'pending' && (
                      <div className="text-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                        <h3 className="text-yellow-200 font-medium">Waiting for Host</h3>
                        <p className="text-yellow-100/60 text-sm mt-1">Please wait, the meeting host will let you in soon.</p>
                      </div>
                    )}

                    {joinStatus === 'denied' && (
                      <div className="text-center p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <h3 className="text-red-200 font-medium">Join Denied</h3>
                        <p className="text-red-100/60 text-sm mt-1">The host denied your request to join.</p>
                        <Button onClick={retryJoin} variant="outline" className="mt-3 border-red-500/30">Request Again</Button>
                      </div>
                    )}

                    {joinStatus === 'idle' && (
                      <div className="text-center p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <h3 className="text-blue-200 font-medium">Connecting...</h3>
                        <p className="text-blue-100/60 text-sm mt-1">Establishing secure connection to server.</p>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            )}
          {/* Stage (Pinned) */}
          <div
            ref={stageRef}
            className={pinnedId ? (isFullscreen ? 'h-full w-full min-h-0' : 'mx-auto flex min-h-0 w-full max-w-7xl flex-1') : 'hidden'}
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
          <div className="hidden">
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

            <div className="text-xs text-white/45">
              {pinnedId ? 'Focus view' : 'Gallery view'}
            </div>
          </div>

          <div className={`mx-auto w-full max-w-[1600px] ${pinnedId ? 'shrink-0' : 'flex min-h-0 flex-1 items-center'}`}>
            <div className={pinnedId ? 'flex w-full gap-3 overflow-x-auto pb-2' : `grid w-full content-center gap-3 ${participantCount <= 1 ? 'grid-cols-1' : participantCount <= 4 ? 'grid-cols-1 sm:grid-cols-2' : participantCount <= 9 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'}`}>
              {!hideSelf && (
                <Card
                  className={`relative mx-auto aspect-video cursor-pointer overflow-hidden rounded-2xl border bg-[#101820] shadow-none transition ${activeSpeakerId === 'local' ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-white/10'} ${pinnedId ? 'w-56 shrink-0' : participantCount === 1 ? 'w-full max-w-5xl' : 'w-full'}`}
                  onClick={pinLocal}
                >
                  <video
                    ref={localThumbRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full -scale-x-100 object-cover"
                  />
                  {!isCameraOn && !isScreenSharing ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#111820]">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 text-3xl font-semibold shadow-lg">
                        {userName.charAt(0).toUpperCase() || 'Y'}
                      </div>
                    </div>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 pt-12 text-sm font-medium">
                    <span>You {isHost ? '(Host)' : ''}</span>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isMicOn ? 'bg-black/45' : 'bg-red-600'}`}>
                      {isMicOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                    </span>
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
                  <React.Fragment key={peerConn.peerId}>
                  <Card
                    className={`relative mx-auto aspect-video cursor-pointer overflow-hidden rounded-2xl border bg-[#101820] shadow-none transition ${activeSpeakerId === peerConn.peerId ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-white/10'} ${pinnedId ? 'w-56 shrink-0' : 'w-full'}`}
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

                    <div className="absolute inset-x-0 bottom-0 max-w-full truncate bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 pt-12 text-sm font-medium">
                      {peerConn.userData?.name || `Guest ${index + 1}`}
                    </div>

                    {pinnedId === peerConn.peerId ? (
                      <div className="absolute top-3 right-3 rounded-full border border-white/10 bg-black/45 p-1.5 text-white">
                        <Pin className="w-3.5 h-3.5" />
                      </div>
                    ) : null}
                  </Card>
                  {peerConn.screenStream?.getVideoTracks().length ? (
                    <Card
                      className="relative aspect-video w-80 shrink-0 cursor-pointer overflow-hidden rounded-[22px] border border-cyan-400/30 bg-[#08101b]"
                      onClick={() => pinPeer(peerConn.peerId)}
                    >
                      <video
                        autoPlay
                        playsInline
                        className="h-full w-full object-contain"
                        ref={(el) => {
                          if (el && el.srcObject !== peerConn.screenStream) {
                            el.srcObject = peerConn.screenStream || null;
                          }
                        }}
                      />
                      <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur-md">
                        {peerConn.userData?.name || `Guest ${index + 1}`} · Presenting
                      </div>
                    </Card>
                  ) : null}
                  </React.Fragment>
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
        {(activeSidebarTab === "chat") && (
          <Card className="w-80 border-l border-white/10 bg-slate-950/72 backdrop-blur-xl flex flex-col rounded-none text-white">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h3 className="font-semibold">Chat</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActiveSidebarTab(null)}
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

      {false && isHost && (activeSidebarTab === "host") ? (
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
                  onClick={() => setActiveSidebarTab(null)}
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

      {false && isHost && activeSidebarTab === null ? (
        <div className="fixed bottom-24 right-4 z-[95]">
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full border-white/10 bg-slate-950/92 px-4 text-white/85 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.85)] backdrop-blur-xl hover:bg-white/10 hover:text-white"
            onClick={() => setActiveSidebarTab("host")}
          >
            <Eye className="w-4 h-4 mr-2" />
            Show host controls
          </Button>
        </div>
      ) : null}

      {/* Control Bar */}
      <div className="relative shrink-0 border-t border-white/10 bg-slate-950/90 px-2 py-2.5 backdrop-blur-2xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)] sm:px-4">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
        {videoSettingsOpen ? (
          <div className="absolute bottom-[68px] left-1/2 z-50 flex w-[min(340px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-1 pb-1">
              <div>
                <p className="text-sm font-semibold">Video options</p>
                <p className="text-xs text-white/40">Camera and background</p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-white/55 hover:bg-white/10 hover:text-white" onClick={() => setVideoSettingsOpen(false)} title="Close video options">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="w-full">
              <Select value={selectedCameraValue} onValueChange={handleCameraSelect}>
                <SelectTrigger className="h-10 w-full rounded-xl border-white/10 bg-white/[0.06] text-white" title={selectedCameraLabel}>
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
              className="hidden"
              onClick={() => setBackgroundMode(backgroundMode === 'blur' ? 'none' : 'blur')}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Blur background
            </Button>

            <Button
              type="button"
              size="lg"
              variant={isLowDataMode ? 'default' : 'outline'}
              className="hidden"
              onClick={async () => {
                setIsLowDataMode(!isLowDataMode);
                if (isCameraOn) {
                  await toggleCamera();
                }
              }}
              title="Lower video resolution to save bandwidth"
            >
              <Signal className="w-4 h-4 mr-2" />
              Low Data Mode
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-10 w-full justify-start rounded-xl px-3 text-white/75 hover:bg-white/10 hover:text-white">
                  <Sparkles className="mr-2 h-4 w-4" /> Backgrounds and effects
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

        <div className="mx-auto flex w-full max-w-7xl flex-nowrap items-center justify-between gap-1 overflow-visible sm:justify-center sm:gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <Button
            onClick={() => {
              setVideoSettingsOpen(false);
              setAudioSettingsOpen((current) => !current);
            }}
            size="lg"
            variant="outline"
            className="hidden h-10 w-8 rounded-full border-0 bg-transparent px-0 text-white/65 hover:bg-white/10 hover:text-white sm:flex"
            title={audioSettingsOpen ? 'Hide audio settings' : 'Show audio settings'}
          >
            {audioSettingsOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </Button>

          <Button
            onClick={toggleMicrophone}
            size="lg"
            variant={isMicOn ? 'default' : 'destructive'}
            className={isMicOn ? 'h-11 w-11 rounded-full bg-white/10 px-0 text-white hover:bg-white/20' : 'h-11 w-11 rounded-full bg-red-600 px-0 hover:bg-red-500'}
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
            onClick={() => {
              setAudioSettingsOpen(false);
              setVideoSettingsOpen((current) => !current);
            }}
            size="lg"
            variant="outline"
            className="hidden h-10 w-8 rounded-full border-0 bg-transparent px-0 text-white/65 hover:bg-white/10 hover:text-white sm:flex"
            title={videoSettingsOpen ? 'Hide video settings' : 'Show video settings'}
          >
            {videoSettingsOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </Button>

          <Button
          onClick={toggleCamera}
          size="lg"
          variant={isCameraOn ? 'default' : 'destructive'}
          className={isCameraOn ? 'h-11 w-11 rounded-full bg-white/10 px-0 text-white hover:bg-white/20' : 'h-11 w-11 rounded-full bg-red-600 px-0 hover:bg-red-500'}
          title={selectedCameraLabel}
        >
          {isCameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
            {isScreenSharing ? (
              <Button
                onClick={() => toggleScreenShare(false)}
                size="lg"
                className="h-11 rounded-full bg-primary px-4 text-white hover:bg-primary/90"
                title="Stop presenting"
              >
                <Square className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Stop sharing</span>
              </Button>
            ) : (
              <Button
                onClick={() => toggleScreenShare(true)}
                size="lg"
                variant="outline"
                className="h-11 rounded-full border-0 bg-white/10 px-3 text-white/80 hover:bg-white/20 hover:text-white"
                title="Share screen or window"
              >
                <Share2 className="h-5 w-5" />
                <span className="ml-2 hidden sm:inline">Share</span>
              </Button>
            )}

            <Button
              onClick={isHandRaised ? lowerHand : raiseHand}
              size="lg"
              variant={isHandRaised ? 'default' : 'outline'}
              className={isHandRaised ? 'hidden h-11 w-11 rounded-full bg-amber-500 px-0 text-white hover:bg-amber-600 sm:flex' : 'hidden h-11 w-11 rounded-full border-0 bg-white/10 px-0 text-white/80 hover:bg-white/20 hover:text-white sm:flex'}
              title={isHandRaised ? 'Lower hand' : 'Raise hand'}
            >
              <Hand className="w-5 h-5" />
            </Button>

            <Button
              onClick={() => setActiveSidebarTab(activeSidebarTab === "chat" ? null : "chat")}
              size="lg"
              variant={(activeSidebarTab === "chat") ? 'default' : 'outline'}
              className={(activeSidebarTab === "chat") ? 'hidden h-11 w-11 rounded-full bg-primary px-0 hover:bg-primary/90 sm:flex' : 'hidden h-11 w-11 rounded-full border-0 bg-white/10 px-0 text-white/80 hover:bg-white/20 hover:text-white sm:flex'}
            >
              <MessageSquare className="w-5 h-5" />
            </Button>

            <Button
              onClick={() => setActiveSidebarTab(activeSidebarTab === 'participants' ? null : 'participants')}
              size="lg"
              variant={activeSidebarTab === 'participants' ? 'default' : 'outline'}
              className={activeSidebarTab === 'participants' ? 'relative hidden h-11 w-11 rounded-full bg-primary px-0 hover:bg-primary/90 sm:flex' : 'relative hidden h-11 w-11 rounded-full border-0 bg-white/10 px-0 text-white/80 hover:bg-white/20 hover:text-white sm:flex'}
              title="Participants"
            >
              <Users className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-slate-950">{participantCount}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" variant="outline" className="h-11 w-11 rounded-full border-0 bg-white/10 px-0 text-white/80 hover:bg-white/20 hover:text-white" title="More meeting options">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={10} className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Meeting {roomLabel}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={copyRoomLink}><Copy className="h-4 w-4" /> Copy meeting link</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHideSelf((current) => !current)}>
                  {hideSelf ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {hideSelf ? 'Show my tile' : 'Hide my tile'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsLowDataMode(!isLowDataMode)}><Signal className="h-4 w-4" /> Low data mode: {isLowDataMode ? 'On' : 'Off'}</DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={() => { setVideoSettingsOpen(false); setAudioSettingsOpen(true); }}><Mic className="h-4 w-4" /> Audio settings</DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={() => { setAudioSettingsOpen(false); setVideoSettingsOpen(true); }}><VideoIcon className="h-4 w-4" /> Video options</DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={isHandRaised ? lowerHand : raiseHand}><Hand className="h-4 w-4" /> {isHandRaised ? 'Lower hand' : 'Raise hand'}</DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={() => setActiveSidebarTab('chat')}><MessageSquare className="h-4 w-4" /> Open chat</DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={() => setActiveSidebarTab('participants')}><Users className="h-4 w-4" /> Participants ({participantCount})</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void toggleFullscreen()}>
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                </DropdownMenuItem>
                {isHost ? (
                  <>
                    <DropdownMenuSeparator className="sm:hidden" />
                    <DropdownMenuLabel className="sm:hidden">Host and recording</DropdownMenuLabel>
                    <DropdownMenuItem className="sm:hidden" onSelect={() => hostMuteAll()}><MicOff className="h-4 w-4" /> Mute everyone</DropdownMenuItem>
                    <DropdownMenuItem className="sm:hidden" onSelect={() => setMeetingLocked(!isMeetingLocked)}>
                      {isMeetingLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      {isMeetingLocked ? 'Unlock meeting' : 'Lock meeting'}
                    </DropdownMenuItem>
                    {(recordingStatus === 'idle' || recordingStatus === 'failed') ? <DropdownMenuItem className="sm:hidden" onSelect={startRecording}><Circle className="h-4 w-4 text-red-500" /> Start recording</DropdownMenuItem> : null}
                    {recordingStatus === 'recording' ? <DropdownMenuItem className="sm:hidden" onSelect={pauseRecording}><Pause className="h-4 w-4" /> Pause recording</DropdownMenuItem> : null}
                    {recordingStatus === 'paused' ? <DropdownMenuItem className="sm:hidden" onSelect={resumeRecording}><Play className="h-4 w-4" /> Resume recording</DropdownMenuItem> : null}
                    {['awaiting_recorder', 'recording', 'paused'].includes(recordingStatus) ? <DropdownMenuItem className="sm:hidden" onSelect={stopRecording}><Square className="h-4 w-4" /> Stop recording</DropdownMenuItem> : null}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled><Signal className="h-4 w-4" /> Network: {networkQuality}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isHost ? (
            <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="lg" variant="outline" className="hidden h-11 rounded-full border-0 bg-white/10 px-3 text-white/80 hover:bg-white/20 hover:text-white sm:flex" title="Host controls">
                    <Shield className="h-5 w-5" /><span className="ml-2 hidden lg:inline">Host</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" sideOffset={10} className="w-56">
                  <DropdownMenuLabel>Host controls</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => hostMuteAll()}><MicOff className="h-4 w-4" /> Mute everyone</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setActiveSidebarTab('participants')}><Users className="h-4 w-4" /> Manage participants</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMeetingLocked(!isMeetingLocked)}>
                    {isMeetingLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {isMeetingLocked ? 'Unlock meeting' : 'Lock meeting'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="lg" variant="outline" className={recordingStatus === 'recording' ? 'hidden h-11 rounded-full border-red-500/30 bg-red-500/10 px-3 text-red-200 hover:bg-red-500/20 sm:flex' : 'hidden h-11 rounded-full border-0 bg-white/10 px-3 text-white/80 hover:bg-white/20 hover:text-white sm:flex'} title="Recording controls">
                    <Circle className={`h-4 w-4 ${recordingStatus === 'recording' ? 'fill-red-500 text-red-500' : 'text-red-400'}`} />
                    <span className="ml-2 hidden lg:inline">{recordingStatus === 'recording' ? 'Recording' : 'Record'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" sideOffset={10} className="w-52">
                  <DropdownMenuLabel>Recording</DropdownMenuLabel>
                  {recordingStatus === 'idle' || recordingStatus === 'failed' ? <DropdownMenuItem onSelect={startRecording}><Circle className="h-4 w-4 text-red-500" /> Start recording</DropdownMenuItem> : null}
                  {recordingStatus === 'recording' ? <DropdownMenuItem onSelect={pauseRecording}><Pause className="h-4 w-4" /> Pause recording</DropdownMenuItem> : null}
                  {recordingStatus === 'paused' ? <DropdownMenuItem onSelect={resumeRecording}><Play className="h-4 w-4" /> Resume recording</DropdownMenuItem> : null}
                  {['awaiting_recorder', 'recording', 'paused'].includes(recordingStatus) ? <DropdownMenuItem onSelect={stopRecording}><Square className="h-4 w-4" /> Stop recording</DropdownMenuItem> : null}
                  {recordingStatus === 'awaiting_recorder' || recordingStatus === 'stopping' ? <DropdownMenuItem disabled>{recordingStatus === 'stopping' ? 'Stopping…' : 'Starting recorder…'}</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="lg"
                    className="h-11 w-11 rounded-full bg-red-600 px-0 text-white shadow-[0_14px_28px_-18px_rgba(220,38,38,0.9)] hover:bg-red-500 sm:w-auto sm:px-4"
                    title="Leave options"
                  >
                    <PhoneOff className="h-5 w-5 sm:mr-2" />
                    <span className="hidden sm:inline">Leave</span>
                    <ChevronUp className="ml-2 hidden h-3.5 w-3.5 sm:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={10} className="w-64 rounded-xl p-2">
                  <DropdownMenuLabel className="px-2 py-2">
                    <span className="block text-sm font-semibold">Leave this meeting?</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Choose what happens to everyone else.</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="rounded-lg p-3" onSelect={leaveRoom}>
                    <PhoneOff className="h-4 w-4" />
                    <div><p className="font-medium">Leave meeting</p><p className="text-xs text-muted-foreground">The meeting continues without you</p></div>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg p-3 text-red-500 focus:text-red-500" onSelect={handleEndMeeting}>
                    <Square className="h-4 w-4" />
                    <div><p className="font-medium">End meeting for everyone</p><p className="text-xs text-muted-foreground">Disconnect all participants</p></div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
              <Button
                onClick={leaveRoom}
                size="lg"
                className="h-11 w-11 rounded-full bg-red-600 px-0 text-white shadow-[0_14px_28px_-18px_rgba(220,38,38,0.9)] hover:bg-red-500 sm:w-auto sm:px-4"
              >
                <PhoneOff className="h-5 w-5 sm:mr-2" />
                <span className="hidden sm:inline">Leave</span>
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
