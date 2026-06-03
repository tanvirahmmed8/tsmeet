(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = window.location.pathname.split('/').pop();
  const roomId = params.get('roomId') || '';
  const signalingServer = (params.get('signalingServer') || '').replace(/\/+$/, '');
  const backendUrl = (params.get('backendUrl') || '').replace(/\/+$/, '');
  const serviceToken = params.get('serviceToken') || '';
  const serviceInstanceId = params.get('serviceInstanceId') || '';

  const sessionEl = document.getElementById('session');
  const statusEl = document.getElementById('status');
  const peersEl = document.getElementById('peers');
  const errorEl = document.getElementById('error');

  sessionEl.textContent = `Session: ${sessionId}`;

  const setStatus = (value) => {
    statusEl.textContent = `Status: ${value}`;
  };

  const setError = (value) => {
    errorEl.textContent = value || '';
  };

  const setPeerCount = (count) => {
    peersEl.textContent = `Connected peers: ${count}`;
  };

  const peers = new Map();
  const videos = new Map();
  const audioSources = new Map();
  let socket = null;
  let audioContext = null;
  let audioDestination = null;
  let animationFrame = null;
  let mediaRecorder = null;
  let audioRecorder = null;
  let videoChunks = [];
  let audioChunks = [];
  let heartbeatTimer = null;
  let lastSessionStatus = null;

  const ensureAudioDestination = async () => {
    if (!audioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextCtor();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    if (!audioDestination) {
      audioDestination = audioContext.createMediaStreamDestination();
    }
    return audioDestination;
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;

  const drawComposite = () => {
    const ctx = canvas.getContext('2d');
    const activeVideos = Array.from(videos.values()).filter((video) => video.readyState >= 2 && !video.paused);

    ctx.fillStyle = '#020817';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (activeVideos.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for participants', canvas.width / 2, canvas.height / 2 - 12);
      ctx.font = '400 20px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Hidden recorder is ready for incoming streams.', canvas.width / 2, canvas.height / 2 + 28);
    } else {
      const columns = activeVideos.length === 1 ? 1 : activeVideos.length <= 4 ? 2 : 3;
      const rows = Math.ceil(activeVideos.length / columns);
      const gap = 16;
      const tileWidth = (canvas.width - gap * (columns + 1)) / columns;
      const tileHeight = (canvas.height - gap * (rows + 1)) / rows;

      activeVideos.forEach((video, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = gap + column * (tileWidth + gap);
        const y = gap + row * (tileHeight + gap);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x, y, tileWidth, tileHeight);
        ctx.drawImage(video, x, y, tileWidth, tileHeight);
      });
    }

    animationFrame = requestAnimationFrame(drawComposite);
  };

  const apiFetch = async (pathname, init) => {
    const response = await fetch(`${backendUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        ...(init && init.headers ? init.headers : {}),
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${pathname} failed: ${response.status} ${text}`);
    }
    return response.json();
  };

  const attachRemoteStream = async (peerId, stream) => {
    const destination = await ensureAudioDestination();
    let video = videos.get(peerId);
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      videos.set(peerId, video);
    }
    video.srcObject = stream;
    video.play().catch(() => undefined);

    if (!audioSources.has(peerId) && audioContext) {
      try {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
        audioSources.set(peerId, source);
      } catch (error) {
        console.warn('[Recorder] Failed to attach audio source', error);
      }
    }
  };

  const removePeer = (peerId) => {
    const connection = peers.get(peerId);
    if (connection) {
      connection.peer.destroy();
      peers.delete(peerId);
    }
    const video = videos.get(peerId);
    if (video) {
      video.pause();
      video.srcObject = null;
      videos.delete(peerId);
    }
    const source = audioSources.get(peerId);
    if (source) {
      source.disconnect();
      audioSources.delete(peerId);
    }
    setPeerCount(peers.size);
  };

  const uploadArtifact = async (kind, blob) => {
    if (!blob.size) return;
    await fetch(`${backendUrl}/api/recording-service/sessions/${sessionId}/artifacts/${kind}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    });
  };

  const stopRecorders = async () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    setStatus('stopping');

    await new Promise((resolve) => {
      let remaining = 1 + (audioRecorder && audioRecorder.state !== 'inactive' ? 1 : 0);
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      };
      mediaRecorder.onstop = done;
      mediaRecorder.stop();
      if (audioRecorder && audioRecorder.state !== 'inactive') {
        audioRecorder.onstop = done;
        audioRecorder.stop();
      }
    });

    try {
      const videoBlob = new Blob(videoChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      const audioBlob = new Blob(audioChunks, { type: audioRecorder && audioRecorder.mimeType ? audioRecorder.mimeType : 'audio/webm' });
      await uploadArtifact('video', videoBlob);
      await uploadArtifact('audio', audioBlob);
      await apiFetch(`/api/recording-service/sessions/${sessionId}/complete`, { method: 'POST' });
      setStatus('completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload recorder artifacts.';
      setError(message);
      setStatus('failed');
      await apiFetch(`/api/recording-service/sessions/${sessionId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: message }),
      }).catch(() => undefined);
    }
  };

  const startRecorders = async () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      if (mediaRecorder.state === 'paused') mediaRecorder.resume();
      if (audioRecorder && audioRecorder.state === 'paused') audioRecorder.resume();
      setStatus('recording');
      return;
    }

    const destination = await ensureAudioDestination();
    if (!animationFrame) animationFrame = requestAnimationFrame(drawComposite);

    const composedStream = canvas.captureStream(30);
    destination.stream.getAudioTracks().forEach((track) => composedStream.addTrack(track));

    const videoMimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const audioMimeTypes = ['audio/webm;codecs=opus', 'audio/webm'];
    const videoMimeType = videoMimeTypes.find((value) => MediaRecorder.isTypeSupported(value)) || 'video/webm';
    const audioMimeType = audioMimeTypes.find((value) => MediaRecorder.isTypeSupported(value)) || 'audio/webm';

    videoChunks = [];
    audioChunks = [];
    mediaRecorder = new MediaRecorder(composedStream, { mimeType: videoMimeType });
    audioRecorder = new MediaRecorder(destination.stream, { mimeType: audioMimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) videoChunks.push(event.data);
    };
    audioRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onerror = async () => {
      const message = 'Video recorder worker failed.';
      setError(message);
      setStatus('failed');
      await apiFetch(`/api/recording-service/sessions/${sessionId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: message }),
      }).catch(() => undefined);
    };
    audioRecorder.onerror = async () => {
      const message = 'Audio recorder worker failed.';
      setError(message);
      setStatus('failed');
      await apiFetch(`/api/recording-service/sessions/${sessionId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: message }),
      }).catch(() => undefined);
    };

    mediaRecorder.start(1000);
    audioRecorder.start(1000);
    setStatus('recording');
  };

  const pauseRecorders = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
    if (audioRecorder && audioRecorder.state === 'recording') audioRecorder.pause();
    setStatus('paused');
  };

  const createPeerConnection = (peerId, initiator) => {
    if (peers.has(peerId)) {
      return peers.get(peerId).peer;
    }

    const peer = new window.SimplePeer({
      initiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peer.on('signal', (signal) => {
      if (!socket) return;
      if (signal.type === 'offer') {
        socket.emit('send-offer', { roomId, targetSocketId: peerId, offer: signal });
      } else if (signal.type === 'answer') {
        socket.emit('send-answer', { roomId, targetSocketId: peerId, answer: signal });
      } else if (signal.candidate) {
        socket.emit('send-ice-candidate', { roomId, targetSocketId: peerId, candidate: signal });
      }
    });

    peer.on('stream', (stream) => {
      attachRemoteStream(peerId, stream).catch((error) => {
        console.error('[Recorder] attach stream failed', error);
      });
    });
    peer.on('close', () => removePeer(peerId));
    peer.on('error', () => removePeer(peerId));

    peers.set(peerId, { peerId, peer });
    setPeerCount(peers.size);
    return peer;
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      apiFetch(`/api/recording-service/sessions/${sessionId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceInstanceId }),
      }).catch(() => undefined);
    }, 5000);
  };

  const connect = async () => {
    if (!sessionId || !roomId || !signalingServer || !backendUrl || !serviceToken || !serviceInstanceId) {
      setError('Recorder page is missing required parameters.');
      setStatus('failed');
      return;
    }

    setStatus('connecting');
    socket = window.io(signalingServer, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      socket.emit('join-recorder', {
        roomId,
        sessionId,
        serviceInstanceId,
        serviceToken,
      });
    });

    socket.on('recorder-joined', async (data) => {
      try {
        setStatus('claiming');
        const session = await apiFetch(`/api/recording-service/sessions/${sessionId}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceInstanceId, recorderSocketId: data.socketId }),
        });
        startHeartbeat();
        lastSessionStatus = session.status;
        if (session.status === 'recording') {
          await startRecorders();
        } else if (session.status === 'paused') {
          await startRecorders();
          pauseRecorders();
        } else if (session.status === 'stopping') {
          await stopRecorders();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to claim recorder session.';
        setError(message);
        setStatus('failed');
      }
    });

    socket.on('recorder-join-denied', () => {
      setError('Recorder socket was denied by the backend.');
      setStatus('failed');
    });

    socket.on('room-participants', (participants) => {
      participants.forEach((participant) => createPeerConnection(participant.socketId, true));
    });

    socket.on('user-joined', (data) => {
      createPeerConnection(data.socketId, true);
    });

    socket.on('receive-offer', (data) => {
      const peer = createPeerConnection(data.socketId, false);
      peer.signal(data.offer);
    });

    socket.on('receive-answer', (data) => {
      const connection = peers.get(data.socketId);
      if (connection) connection.peer.signal(data.answer);
    });

    socket.on('receive-ice-candidate', (data) => {
      const connection = peers.get(data.socketId);
      if (connection) connection.peer.signal(data.candidate);
    });

    socket.on('user-left', (data) => {
      removePeer(data.socketId);
    });

    socket.on('recording-session-updated', (session) => {
      if (!session || session.status === lastSessionStatus) return;
      lastSessionStatus = session.status;

      if (session.status === 'recording') {
        startRecorders().catch((error) => setError(String(error)));
      } else if (session.status === 'paused') {
        pauseRecorders();
      } else if (session.status === 'stopping') {
        stopRecorders().catch((error) => setError(String(error)));
      } else if (session.status === 'failed') {
        setError(session.failureReason || 'Recorder session failed.');
        setStatus('failed');
      } else if (session.status === 'completed') {
        setStatus('completed');
      }
    });
  };

  window.addEventListener('beforeunload', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    peers.forEach((connection) => connection.peer.destroy());
    if (socket) socket.disconnect();
  });

  connect().catch((error) => {
    setError(error instanceof Error ? error.message : 'Recorder boot failed.');
    setStatus('failed');
  });
})();
