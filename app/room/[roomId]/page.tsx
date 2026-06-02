'use client';

import React from "react"

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Input } from '@/components/ui/input';
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
  Circle,
  Pause,
  Play,
  Square,
} from 'lucide-react';

interface Participant {
  id: string;
  name: string;
  socketId: string;
}

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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localThumbRef = useRef<HTMLVideoElement>(null);
  const stageVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const audioRecordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioRecordingStreamRef = useRef<MediaStream | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingMimeTypeRef = useRef<string>('video/webm');
  const audioRecordingMimeTypeRef = useRef<string>('audio/webm');

  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
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

  const getStageSelection = () => {
    if (pinnedId) {
      return pinnedId;
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
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

  const buildRecordingStream = () => {
    const recordingStream = new MediaStream();

    const stageCapture = stageVideoRef.current?.captureStream?.();
    const stageVideoTrack = stageCapture?.getVideoTracks?.()[0];
    if (stageVideoTrack) {
      recordingStream.addTrack(stageVideoTrack);
    } else if (localStream?.getVideoTracks?.()[0]) {
      recordingStream.addTrack(localStream.getVideoTracks()[0]);
    }

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const streams = [localStream, ...peers.map((peer) => peer.stream).filter(Boolean)] as MediaStream[];
    streams.forEach((stream) => {
      try {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
      } catch (err) {
        console.warn('Unable to add stream to recording mix:', err);
      }
    });
    destination.stream.getAudioTracks().forEach((track) => recordingStream.addTrack(track));

    recordingAudioContextRef.current = audioContext;
    recordingStreamRef.current = recordingStream;
    audioRecordingStreamRef.current = destination.stream;
    return recordingStream;
  };

  const startRecording = () => {
    if (!isHost) return;
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setRecordingError('Recording is not supported in this browser.');
      return;
    }

    try {
      const stream = buildRecordingStream();
      const mimeTypeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mimeType = mimeTypeCandidates.find((value) => MediaRecorder.isTypeSupported(value)) || 'video/webm';
      recordingMimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      audioRecordingChunksRef.current = [];

      const audioStream = audioRecordingStreamRef.current;
      if (!audioStream || audioStream.getAudioTracks().length === 0) {
        throw new Error('No audio stream available for audio-only recording.');
      }
      const audioMimeTypeCandidates = ['audio/webm;codecs=opus', 'audio/webm'];
      const audioMimeType = audioMimeTypeCandidates.find((value) => MediaRecorder.isTypeSupported(value)) || 'audio/webm';
      audioRecordingMimeTypeRef.current = audioMimeType;
      const audioRecorder = new MediaRecorder(audioStream, { mimeType: audioMimeType });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      audioRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioRecordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mime = recordingMimeTypeRef.current || 'video/webm';
        const blob = new Blob(recordingChunksRef.current, { type: mime });
        if (blob.size > 0) {
          const fileExt = mime.includes('webm') ? 'webm' : 'mp4';
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `meeting-${roomId}-${Date.now()}.${fileExt}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }

        const audioMime = audioRecordingMimeTypeRef.current || 'audio/webm';
        const audioBlob = new Blob(audioRecordingChunksRef.current, { type: audioMime });
        if (audioBlob.size > 0) {
          const audioFileExt = audioMime.includes('webm') ? 'webm' : 'ogg';
          const audioUrl = URL.createObjectURL(audioBlob);
          const audioLink = document.createElement('a');
          audioLink.href = audioUrl;
          audioLink.download = `meeting-audio-${roomId}-${Date.now()}.${audioFileExt}`;
          document.body.appendChild(audioLink);
          audioLink.click();
          audioLink.remove();
          URL.revokeObjectURL(audioUrl);
        }

        recordingStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
        audioRecordingStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        audioRecordingStreamRef.current = null;
        recordingAudioContextRef.current?.close().catch(() => undefined);
        recordingAudioContextRef.current = null;
        mediaRecorderRef.current = null;
        audioRecorderRef.current = null;
        setRecordingStatus('idle');
      };

      recorder.onerror = () => {
        setRecordingError('Recording failed. Try again.');
      };
      audioRecorder.onerror = () => {
        setRecordingError('Audio recording failed. Try again.');
      };

      recorder.start(1000);
      audioRecorder.start(1000);
      mediaRecorderRef.current = recorder;
      audioRecorderRef.current = audioRecorder;
      setRecordingError(null);
      setRecordingStatus('recording');
    } catch (err) {
      console.error('Failed to start recording:', err);
      setRecordingError('Failed to start recording.');
      recordingAudioContextRef.current?.close().catch(() => undefined);
      recordingAudioContextRef.current = null;
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      audioRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioRecordingStreamRef.current = null;
      audioRecorderRef.current = null;
    }
  };

  const pauseRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    mediaRecorderRef.current.pause();
    if (audioRecorderRef.current && audioRecorderRef.current.state === 'recording') {
      audioRecorderRef.current.pause();
    }
    setRecordingStatus('paused');
  };

  const resumeRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'paused') return;
    mediaRecorderRef.current.resume();
    if (audioRecorderRef.current && audioRecorderRef.current.state === 'paused') {
      audioRecorderRef.current.resume();
    }
    setRecordingStatus('recording');
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop();
    }
    mediaRecorderRef.current.stop();
  };

  useEffect(() => {
    if (!autoRecordEnabled || !isHost || joinStatus !== 'approved') return;
    if (autoRecordPromptHandled) return;
    if (recordingStatus !== 'idle') return;
    setShowAutoRecordPrompt(true);
  }, [autoRecordEnabled, isHost, joinStatus, recordingStatus, autoRecordPromptHandled]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
          audioRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingAudioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  return (
    <div className="h-screen bg-background dark:bg-background/95 flex flex-col overflow-hidden">
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
      <header className="border-b border-border bg-card/50 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Meeting Room</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={copyRoomLink} title="Copy room link">
            <Copy className="w-4 h-4" />
          </Button>

          <Button size="sm" variant="ghost" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="ghost" title="Participants">
                <Users className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px]">
              <SheetHeader>
                <SheetTitle>Participants ({peers.length + 1})</SheetTitle>
              </SheetHeader>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary/20"
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
                  <Button size="sm" variant="outline" className="border-primary/20" onClick={unpin}>
                    <PinOff className="w-4 h-4 mr-2" /> Unpin
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="h-[calc(100vh-170px)] mt-4 pr-3">
                <div className="space-y-2">
                  {isHost ? (
                    <Card className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Host controls</p>
                        <p className="text-xs text-foreground/60">Moderate participants</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={hostMuteAll}>
                        Mute all
                      </Button>
                    </Card>
                  ) : null}

                  {isHost && unmuteRequests.length > 0 ? (
                    <Card className="p-3 border border-primary/20 bg-primary/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Unmute requests</p>
                          <p className="text-xs text-foreground/60">
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
                              <p className="text-xs text-foreground/50 truncate">{req.socketId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => approveUnmute(req.socketId)}>
                                <UserCheck className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => denyUnmute(req.socketId)}>
                                <UserX className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  {isHost && pendingRequests.length > 0 ? (
                    <Card className="p-3 border border-primary/20 bg-primary/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Join requests</p>
                          <p className="text-xs text-foreground/60">
                            {pendingRequests.length} waiting
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={approveAll}>
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
                              <p className="text-xs text-foreground/50 truncate">{req.socketId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => approveJoin(req.socketId)}>
                                <UserCheck className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => denyJoin(req.socketId)}>
                                <UserX className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : null}

                  <Card className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">You</p>
                      <p className="text-xs text-foreground/60 truncate">{userName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isHost ? (
                        <span className="text-xs text-primary">Host</span>
                      ) : null}
                      {isHandRaised ? (
                        <span className="text-xs text-amber-600">Hand raised</span>
                      ) : null}
                      <Button size="sm" variant="outline" className="border-primary/20" onClick={pinLocal}>
                        <Pin className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>

                  {peers.map((p) => (
                    <Card key={p.peerId} className="p-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">Participant</p>
                        <p className="text-xs text-foreground/60 truncate">{p.peerId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {raisedHands.some((h) => h.socketId === p.peerId) ? (
                          <span className="text-xs text-amber-600">Hand raised</span>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/20"
                          onClick={() => pinPeer(p.peerId)}
                        >
                          <Pin className="w-4 h-4" />
                        </Button>
                        {isHost ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => transferHost(p.peerId)} title="Make host">
                              <Crown className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => hostMute(p.peerId)}>
                              <Mic className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => hostStopVideo(p.peerId)}>
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

          <span className="text-sm text-foreground/60">{peers.length + 1} Participants</span>
        </div>
      </header>

      {webrtcError && (
        <div className="px-4 pt-3">
          <div className="max-w-4xl mx-auto bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive">{webrtcError}</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main Video Area */}
        <div className="flex-1 min-h-0 flex flex-col items-stretch justify-start bg-slate-900/50 dark:bg-slate-950/50 relative p-4 gap-4 overflow-hidden">
            {joinStatus !== 'approved' && !needsName && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-card/90 border border-border rounded-lg p-6 max-w-sm text-center">
                  {joinStatus === 'pending' && (
                    <>
                      <h3 className="text-lg font-semibold">Waiting for approval</h3>
                      <p className="text-sm text-foreground/70 mt-2">
                        The host needs to approve your request to join.
                      </p>
                    </>
                  )}

                  {joinStatus === 'denied' && (
                    <>
                      <h3 className="text-lg font-semibold">Join request denied</h3>
                      <p className="text-sm text-foreground/70 mt-2">
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
                      <p className="text-sm text-foreground/70 mt-2">
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
            className={isFullscreen ? 'w-full h-full' : 'w-full max-w-6xl mx-auto'}
          >
            <Card
              className={
                `w-full ${
                  isFullscreen
                    ? 'h-full'
                    : 'h-[min(60vh,calc(100vh-260px))]'
                } border-primary/10 bg-black rounded-lg overflow-hidden relative`
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
              ) : stageStream ? (
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
              ) : (
                <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-white/30 mx-auto mb-2" />
                    <p className="text-white/70">Waiting for stream…</p>
                  </div>
                </div>
              )}

              <div className="absolute top-4 right-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-black/40 hover:bg-black/55 text-white border border-white/10"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>

                {pinnedId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-black/40 hover:bg-black/55 text-white border border-white/10"
                    onClick={unpin}
                    title="Unpin"
                  >
                    <PinOff className="w-4 h-4" />
                  </Button>
                ) : null}
              </div>

              <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-2 rounded-lg text-sm text-white flex items-center gap-2">
                <span className="font-medium">
                  {stageSelection === 'local' ? 'You' : 'Pinned'}
                </span>
                {stageSelection === 'local' && isScreenSharing ? (
                  <span className="text-white/70">(Sharing screen)</span>
                ) : null}
              </div>

              {stageSelection === 'local' && !isCameraOn && !isScreenSharing ? (
                <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 text-white/50 mx-auto mb-2" />
                    <p className="text-white/70">Camera is off</p>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Filmstrip */}
          <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-primary/20"
                onClick={() => setHideSelf((v) => !v)}
              >
                {hideSelf ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                {hideSelf ? 'Show me' : 'Hide me'}
              </Button>

              {pinnedId ? (
                <Button size="sm" variant="outline" className="border-primary/20" onClick={unpin}>
                  <PinOff className="w-4 h-4 mr-2" /> Unpin
                </Button>
              ) : null}
            </div>

            <div className="text-xs text-white/70">
              Click a tile to pin
            </div>
          </div>

          <div className="w-full max-w-6xl mx-auto min-h-0">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {!hideSelf && (
                <Card
                  className="shrink-0 w-56 aspect-video border-primary/10 bg-black rounded-lg overflow-hidden relative cursor-pointer"
                  onClick={pinLocal}
                >
                  <video
                    ref={localThumbRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
                    You
                  </div>
                  {pinnedId === 'local' ? (
                    <div className="absolute top-2 right-2 bg-black/50 border border-white/10 rounded-md p-1 text-white">
                      <Pin className="w-3.5 h-3.5" />
                    </div>
                  ) : null}
                </Card>
              )}

              {peers.map((peerConn) => {
                const stream = peerConn.stream;
                return (
                  <Card
                    key={peerConn.peerId}
                    className="shrink-0 w-56 aspect-video border-primary/10 bg-black rounded-lg overflow-hidden relative cursor-pointer"
                    onClick={() => pinPeer(peerConn.peerId)}
                  >
                    {stream ? (
                      <video
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        ref={(el) => {
                          if (!el) return;
                          if (el.srcObject !== stream) el.srcObject = stream;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                        <p className="text-white/70 text-sm">Connecting…</p>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
                      Participant
                    </div>

                    {pinnedId === peerConn.peerId ? (
                      <div className="absolute top-2 right-2 bg-black/50 border border-white/10 rounded-md p-1 text-white">
                        <Pin className="w-3.5 h-3.5" />
                      </div>
                    ) : null}
                  </Card>
                );
              })}

              {hideSelf && peers.length === 0 ? (
                <div className="shrink-0 h-[126px] flex items-center px-2">
                  <p className="text-white/70 text-sm">Waiting for participants…</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <Card className="w-80 border-l border-primary/10 bg-card/50 backdrop-blur-sm flex flex-col rounded-none">
            <div className="p-4 border-b border-primary/10 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Chat</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowChat(false)}
                className="text-foreground/60"
              >
                ×
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-foreground/60 text-center">No messages yet</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{msg.sender}</span>
                      <span className="text-xs text-foreground/50">{msg.timestamp}</span>
                    </div>
                    <p className="text-foreground/70 break-words">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-primary/10 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="flex-1 bg-input border border-primary/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/50"
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

      {/* Control Bar */}
      <div className="border-t border-border bg-card/50 backdrop-blur-md px-4 py-4 flex items-center justify-center gap-3">
        <Button
          onClick={toggleMicrophone}
          size="lg"
          variant={isMicOn ? 'default' : 'destructive'}
          className={isMicOn ? 'bg-primary hover:bg-primary/90' : 'bg-destructive hover:bg-destructive/90'}
          disabled={isMutedByHost}
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>

        {isMutedByHost ? (
          <Button
            onClick={requestUnmute}
            size="lg"
            variant="outline"
            className="border-primary/20"
            disabled={unmuteRequested}
          >
            {unmuteRequested ? 'Requested' : 'Request to unmute'}
          </Button>
        ) : null}

        <Button
          onClick={isHandRaised ? lowerHand : raiseHand}
          size="lg"
          variant={isHandRaised ? 'default' : 'outline'}
          className={isHandRaised ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'border-primary/20'}
          title={isHandRaised ? 'Lower hand' : 'Raise hand'}
        >
          <Hand className="w-5 h-5" />
        </Button>

        <Button
          onClick={toggleCamera}
          size="lg"
          variant={isCameraOn ? 'default' : 'destructive'}
          className={isCameraOn ? 'bg-primary hover:bg-primary/90' : 'bg-destructive hover:bg-destructive/90'}
        >
          {isCameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </Button>

        <Button
          onClick={() => toggleScreenShare(shareWithDeviceAudio)}
          size="lg"
          variant={isScreenSharing ? 'default' : 'outline'}
          className="border-primary/20"
          title={shareWithDeviceAudio ? 'Share screen with device audio' : 'Share screen only'}
        >
          <Share2 className="w-5 h-5" />
        </Button>

        <Button
          onClick={() => setShareWithDeviceAudio((prev) => !prev)}
          size="lg"
          variant={shareWithDeviceAudio ? 'default' : 'outline'}
          className="border-primary/20"
          disabled={isScreenSharing}
          title="Include device audio while screen sharing"
        >
          <Volume2 className="w-5 h-5 mr-2" />
          Audio
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="lg" variant="outline" className="border-primary/20" title="Background effects">
                <Sparkles className="w-5 h-5" />
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
          onClick={toggleFullscreen}
          size="lg"
          variant="outline"
          className="border-primary/20"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </Button>

        <Button
          onClick={() => setShowChat(!showChat)}
          size="lg"
          variant="outline"
          className="border-primary/20"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>

        <Button size="lg" variant="outline" className="border-primary/20 bg-transparent">
          <Settings className="w-5 h-5" />
        </Button>

        <div className="mx-4 h-8 w-px bg-border"></div>

        {isHost ? (
          <>
            {recordingStatus === 'idle' ? (
              <Button onClick={startRecording} size="lg" variant="outline" className="border-primary/20">
                <Circle className="w-5 h-5 mr-2 text-red-500" />
                Record
              </Button>
            ) : null}

            {recordingStatus === 'recording' ? (
              <Button onClick={pauseRecording} size="lg" variant="outline" className="border-primary/20">
                <Pause className="w-5 h-5 mr-2" />
                Pause
              </Button>
            ) : null}

            {recordingStatus === 'paused' ? (
              <Button onClick={resumeRecording} size="lg" variant="outline" className="border-primary/20">
                <Play className="w-5 h-5 mr-2" />
                Resume
              </Button>
            ) : null}

            {recordingStatus !== 'idle' ? (
              <Button onClick={stopRecording} size="lg" variant="outline" className="border-primary/20">
                <Square className="w-5 h-5 mr-2" />
                Stop recording
              </Button>
            ) : null}

            <Button
              onClick={handleEndMeeting}
              size="lg"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              <PhoneOff className="w-5 h-5 mr-2" />
              End meeting
            </Button>
          </>
        ) : null}

        <Button
          onClick={leaveRoom}
          size="lg"
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          <PhoneOff className="w-5 h-5 mr-2" />
          Leave meeting
        </Button>
      </div>

      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBackgroundFile}
      />
      {recordingError ? (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {recordingError}
        </div>
      ) : null}
    </div>
  );
}
