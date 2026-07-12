import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import calendarRoutes from './routes/calendars';
import bookingRoutes from './routes/bookings';
import {
  createUserRecordingRoutes,
  createRecorderServiceRoutes,
} from './routes/recordings';
import publicCalendarRoutes from './routes/publicCalendars';
import { initializeDatabase, pool } from './db';
import { authenticateToken } from './middleware/auth';
import { RoomManager } from './services/roomManager';
import { RecordingSessionManager } from './services/recordingSessionManager';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const app = express();
const httpServer = createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use('/recorder-assets', express.static(path.join(process.cwd(), 'public', 'recorder')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', authenticateToken, roomRoutes);
app.use('/api/calendars', authenticateToken, calendarRoutes);
app.use('/api/bookings', authenticateToken, bookingRoutes);
app.use('/api/public/calendars', publicCalendarRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/recorder/:sessionId', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'recorder', 'index.html'));
});

// WebSocket/Socket.IO Events
const roomManager = new RoomManager();
const recordingSessionManager = new RecordingSessionManager();

// Recording Routes
app.use('/api/recordings', authenticateToken, createUserRecordingRoutes(io, recordingSessionManager));
app.use('/api/recording-service', createRecorderServiceRoutes(io, recordingSessionManager));

async function persistRecordingSessionState(sessionId: string) {
  const session = recordingSessionManager.getSession(sessionId);
  if (!session) return;

  await pool.query(
    `INSERT INTO recording_sessions
      (id, room_id, creator_id, started_by_user_id, status, hidden_recorder_socket_id, recorder_service_instance_id, started_at, updated_at, completed_at, last_heartbeat_at, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       hidden_recorder_socket_id = VALUES(hidden_recorder_socket_id),
       recorder_service_instance_id = VALUES(recorder_service_instance_id),
       updated_at = VALUES(updated_at),
       completed_at = VALUES(completed_at),
       last_heartbeat_at = VALUES(last_heartbeat_at),
       failure_reason = VALUES(failure_reason)`,
    [
      session.id,
      session.roomId,
      Number(session.creatorId),
      Number(session.startedByUserId),
      session.status,
      session.hiddenRecorderSocketId || null,
      session.recorderServiceInstanceId || null,
      session.startedAt,
      session.updatedAt,
      session.completedAt || null,
      session.lastHeartbeatAt || null,
      session.failureReason || null,
    ]
  );
}

async function hydrateRecordingSessionsFromDatabase() {
  const result = await pool.query<any>(
    `SELECT *
     FROM recording_sessions
     WHERE status IN ('awaiting_recorder', 'recording', 'paused', 'stopping')
     ORDER BY started_at ASC`
  );

  result.rows.forEach((row) => {
    recordingSessionManager.hydrateSession({
      id: String(row.id),
      roomId: String(row.room_id),
      creatorId: String(row.creator_id),
      startedByUserId: String(row.started_by_user_id),
      status: row.status,
      hiddenRecorderSocketId: null,
      recorderServiceInstanceId: row.recorder_service_instance_id
        ? String(row.recorder_service_instance_id)
        : null,
      startedAt: new Date(row.started_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at).toISOString() : null,
      failureReason: row.failure_reason ? String(row.failure_reason) : null,
    });
  });

  if (result.rows.length > 0) {
    console.log(`♻️ Recovered ${result.rows.length} unfinished recording session(s) from MySQL`);
  }
}

app.use('/api/recordings', authenticateToken, createUserRecordingRoutes(io, recordingSessionManager));
app.use('/api/recording-service', createRecorderServiceRoutes(io, recordingSessionManager));

io.on('connection', (socket) => {
  console.log('[WebSocket] User connected:', socket.id);
  const jwtSecret = process.env.JWT_SECRET;
  const authToken = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
  const bearerToken =
    typeof socket.handshake.headers?.authorization === 'string'
      ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
      : null;
  const token = authToken || bearerToken;
  let authenticatedUserId: string | null = null;

  if (jwtSecret && token) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as { userId?: string | number };
      if (decoded?.userId !== undefined && decoded?.userId !== null) {
        authenticatedUserId = String(decoded.userId);
      }
    } catch {
      socket.emit('auth-error', { message: 'Invalid auth token' });
    }
  }

  const emitHostChange = (roomId: string, hostSocketId: string | null, hostUserId: string | null) => {
    io.to(roomId).emit('host-changed', { hostSocketId, hostUserId });
  };
  const emitRecordingSession = (roomId: string) => {
    io.to(roomId).emit('recording-session-updated', recordingSessionManager.getActiveSessionForRoom(roomId));
  };
  const emitVisibleParticipants = (roomId: string) => {
    io.to(roomId).emit('visible-participants-updated', roomManager.getVisibleParticipants(roomId));
  };

  const isParticipant = (roomId: string, socketId: string) => Boolean(roomManager.getParticipant(roomId, socketId));
  const isParticipantAndTargetInRoom = (roomId: string, targetSocketId: string) =>
    isParticipant(roomId, socket.id) && isParticipant(roomId, targetSocketId);

  // User requests to join a room (waiting room flow)
  socket.on('request-join', async (payload: any) => {
    const { roomId, userId, userData, isHost, token: payloadToken } = payload || {};
    if (!roomId || !userId) return;

    let effectiveAuthenticatedUserId = authenticatedUserId;
    if (!effectiveAuthenticatedUserId && jwtSecret && typeof payloadToken === 'string' && payloadToken) {
      try {
        const decoded = jwt.verify(payloadToken, jwtSecret) as { userId?: string | number };
        if (decoded?.userId !== undefined && decoded?.userId !== null) {
          effectiveAuthenticatedUserId = String(decoded.userId);
        }
      } catch {
        socket.emit('auth-error', { message: 'Invalid auth token' });
      }
    }

    if (effectiveAuthenticatedUserId && effectiveAuthenticatedUserId !== String(userId)) {
      socket.emit('join-denied', { roomId });
      return;
    }

    try {
      const roomResult = await pool.query('SELECT creator_id, ended_at FROM rooms WHERE id = $1', [roomId]);
      if (roomResult.rows.length === 0 || roomResult.rows[0].ended_at) {
        socket.emit('meeting-ended', { roomId });
        return;
      }

      const roomRecord = roomResult.rows[0];
      const creatorId = String(roomRecord.creator_id);
      const joiningUserId = String(userId);
      const existingHost = roomManager.getHost(roomId);

      const MAX_PARTICIPANTS = 100;
      const currentParticipants = roomManager.getRoomParticipants(roomId).filter(p => !p.hidden).length;
      if (currentParticipants >= MAX_PARTICIPANTS && creatorId !== joiningUserId) {
        socket.emit('join-denied', { roomId, message: `Room is full (max ${MAX_PARTICIPANTS} participants)` });
        return;
      }

      if (!existingHost?.socketId && isHost && creatorId === joiningUserId && effectiveAuthenticatedUserId === joiningUserId) {
        roomManager.setHost(roomId, socket.id, joiningUserId);
      }

      const host = roomManager.getHost(roomId);
      const isRoomHost = host?.socketId === socket.id;

      if (isRoomHost) {
        socket.join(roomId);
        roomManager.addUserToRoom(roomId, joiningUserId, socket.id, userData);

        socket.emit('join-approved', { roomId, isHost: true });

        const participants = roomManager.getVisibleParticipants(roomId);
        socket.emit('room-participants', participants.filter((p) => p.socketId !== socket.id));

        socket.to(roomId).emit('user-joined', {
          userId: joiningUserId,
          socketId: socket.id,
          userData,
        });

        emitHostChange(roomId, socket.id, joiningUserId);
        emitVisibleParticipants(roomId);
        emitRecordingSession(roomId);

        roomManager.getPending(roomId).forEach((pendingRequest) => {
          socket.emit('join-request', {
            roomId,
            socketId: pendingRequest.socketId,
            userId: pendingRequest.userId,
            userData: pendingRequest.userData,
          });
        });

        console.log(`[Room ${roomId}] Host ${joiningUserId} joined`);
        return;
      }

      roomManager.addPending(roomId, joiningUserId, socket.id, userData);
      if (host?.socketId) {
        io.to(host.socketId).emit('join-request', {
          roomId,
          socketId: socket.id,
          userId: joiningUserId,
          userData,
        });
      }

      socket.emit('join-pending', { roomId, waitingForHost: !host?.socketId });
      console.log(`[Room ${roomId}] User ${joiningUserId} waiting approval`);
    } catch (error) {
      console.error(`[Room ${roomId}] Failed to process join request:`, error);
      socket.emit('join-denied', { roomId });
    }
  });

  socket.on('join-recorder', (payload: any) => {
    const { roomId, sessionId, serviceInstanceId, serviceToken } = payload || {};
    const expectedToken = process.env.RECORDER_SERVICE_TOKEN?.trim();

    if (!roomId || !sessionId || !serviceInstanceId) return;
    if (!expectedToken || String(serviceToken || '') !== expectedToken) {
      socket.emit('recorder-join-denied', { roomId, sessionId });
      return;
    }

    const session = recordingSessionManager.getSession(String(sessionId));
    if (!session || session.roomId !== String(roomId)) {
      socket.emit('recorder-join-denied', { roomId, sessionId });
      return;
    }

    socket.join(roomId);
    roomManager.addHiddenRecorder(roomId, socket.id, String(serviceInstanceId));
    socket.emit('room-participants', roomManager.getVisibleParticipants(roomId));
    socket.emit('recorder-joined', { roomId, sessionId, socketId: socket.id });
  });

  const approveUser = (roomId: string, targetSocketId: string) => {
    const pending = roomManager.getPendingBySocket(roomId, targetSocketId);
    if (!pending) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    roomManager.removePending(roomId, targetSocketId);

    if (!targetSocket) return;

    targetSocket.join(roomId);
    roomManager.addUserToRoom(roomId, pending.userId, targetSocketId, pending.userData);

    targetSocket.emit('join-approved', { roomId, isHost: false });

    const participants = roomManager.getVisibleParticipants(roomId);
    targetSocket.emit('room-participants', participants.filter((p) => p.socketId !== targetSocketId));

    targetSocket.to(roomId).emit('user-joined', {
      userId: pending.userId,
      socketId: targetSocketId,
      userData: pending.userData,
    });

    emitVisibleParticipants(roomId);
  };

  socket.on('approve-join', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    approveUser(roomId, targetSocketId);
  });

  socket.on('deny-join', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;

    roomManager.removePending(roomId, targetSocketId);
    io.to(targetSocketId).emit('join-denied', { roomId });
  });

  socket.on('approve-all', (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;

    const pending = roomManager.getPending(roomId);
    pending.forEach((req) => {
      approveUser(roomId, req.socketId);
    });
  });

  socket.on('host-mute', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    io.to(targetSocketId).emit('force-mute', { roomId });
  });

  socket.on('host-mute-all', (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    socket.to(roomId).emit('force-mute', { roomId });
  });

  socket.on('host-stop-video', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    io.to(targetSocketId).emit('force-video-off', { roomId });
  });

  socket.on('transfer-host', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;

    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;

    const nextHost = roomManager.transferHost(roomId, targetSocketId);
    if (!nextHost) return;

    emitHostChange(roomId, nextHost.socketId, nextHost.userId);
  });

  socket.on('raise-hand', (payload: any) => {
    const { roomId, userId, userData } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    io.to(roomId).emit('hand-raised', {
      roomId,
      socketId: socket.id,
      userId,
      userData,
    });
  });

  socket.on('lower-hand', (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    io.to(roomId).emit('hand-lowered', {
      roomId,
      socketId: socket.id,
    });
  });

  socket.on('request-unmute', (payload: any) => {
    const { roomId, userId, userData } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    const host = roomManager.getHost(roomId);
    if (!host || !host.socketId) return;
    io.to(host.socketId).emit('unmute-request', {
      roomId,
      socketId: socket.id,
      userId,
      userData,
    });
  });

  socket.on('approve-unmute', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    io.to(targetSocketId).emit('allow-unmute', { roomId });
  });

  socket.on('deny-unmute', (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    io.to(targetSocketId).emit('unmute-denied', { roomId });
  });

  // WebRTC: Send offer
  socket.on('send-offer', (data: any) => {
    const { roomId, targetSocketId, offer } = data;
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const sender = roomManager.getParticipant(roomId, socket.id);
    io.to(targetSocketId).emit('receive-offer', {
      socketId: socket.id,
      offer,
      hidden: Boolean(sender?.hidden),
    });
  });

  // WebRTC: Send answer
  socket.on('send-answer', (data: any) => {
    const { roomId, targetSocketId, answer } = data;
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const sender = roomManager.getParticipant(roomId, socket.id);
    io.to(targetSocketId).emit('receive-answer', {
      socketId: socket.id,
      answer,
      hidden: Boolean(sender?.hidden),
    });
  });

  // WebRTC: Send ICE candidates
  socket.on('send-ice-candidate', (data: any) => {
    const { roomId, targetSocketId, candidate } = data;
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const sender = roomManager.getParticipant(roomId, socket.id);
    io.to(targetSocketId).emit('receive-ice-candidate', {
      socketId: socket.id,
      candidate,
      hidden: Boolean(sender?.hidden),
    });
  });

  // Chat message
  socket.on('send-message', (data: any) => {
    const { roomId, message, senderName, timestamp } = data;
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    io.to(roomId).emit('receive-message', {
      socketId: socket.id,
      message,
      senderName,
      timestamp: timestamp || new Date().toISOString(),
    });
  });

  // User toggles camera
  socket.on('toggle-camera', (data: any) => {
    const { roomId, enabled } = data;
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    socket.to(roomId).emit('user-camera-toggled', {
      socketId: socket.id,
      enabled,
    });
  });

  // User toggles microphone
  socket.on('toggle-microphone', (data: any) => {
    const { roomId, enabled } = data;
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    socket.to(roomId).emit('user-microphone-toggled', {
      socketId: socket.id,
      enabled,
    });
  });

  // User starts screen share
  socket.on('start-screen-share', (data: any) => {
    const { roomId, offer } = data;
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    socket.to(roomId).emit('user-screen-share-started', {
      socketId: socket.id,
      offer,
    });
  });

  // User stops screen share
  socket.on('stop-screen-share', (data: any) => {
    const { roomId } = data;
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    socket.to(roomId).emit('user-screen-share-stopped', {
      socketId: socket.id,
    });
  });

  // User leaves room
  socket.on('leave-room', (roomId: string, userId: string) => {
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    const participant = roomManager.getParticipant(roomId, socket.id);
    roomManager.removeUserFromRoom(roomId, socket.id);
    const hostChanges = roomManager.handleHostDisconnect(socket.id);
    hostChanges.forEach((change) => {
      if (change.newHost) {
        emitHostChange(change.roomId, change.newHost.socketId, change.newHost.userId);
        return;
      }

      emitHostChange(change.roomId, null, null);
    });
    if (!participant?.hidden) {
      socket.to(roomId).emit('user-left', { socketId: socket.id, userId: participant?.userId || userId });
      emitVisibleParticipants(roomId);
    }
    socket.leave(roomId);
    console.log(`[Room ${roomId}] User ${participant?.userId || userId} left`);
  });

  socket.on('end-meeting', async (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId) return;

    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;

    try {
      await pool.query('UPDATE rooms SET ended_at = NOW() WHERE id = $1 AND ended_at IS NULL', [roomId]);
      const session = recordingSessionManager.getActiveSessionForRoom(roomId);
      if (session) {
        const stopped = recordingSessionManager.stopSession(session.id);
        if (stopped) {
          void persistRecordingSessionState(stopped.id).catch((error) => {
            console.error(`[Room ${roomId}] Failed to persist stopped recording session:`, error);
          });
          emitRecordingSession(roomId);
        }
      }
      io.to(roomId).emit('meeting-ended', { roomId });
      roomManager.endRoom(roomId);

      const roomSockets = await io.in(roomId).fetchSockets();
      roomSockets.forEach((roomSocket) => {
        roomSocket.leave(roomId);
      });

      console.log(`[Room ${roomId}] Meeting ended by host ${host.userId}`);
    } catch (error) {
      console.error(`[Room ${roomId}] Failed to end meeting:`, error);
      socket.emit('meeting-end-failed', { roomId });
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    const participant = roomManager.getAllRooms()
      .flatMap((room) => roomManager.getRoomParticipants(room.roomId))
      .find((entry) => entry.socketId === socket.id);
    const participantRoomId = roomManager
      .getAllRooms()
      .find((room) => roomManager.getParticipant(room.roomId, socket.id))?.roomId;

    roomManager.removeUserBySocketId(socket.id);
    const hostChanges = roomManager.handleHostDisconnect(socket.id);
    hostChanges.forEach((change) => {
      if (change.newHost) {
        emitHostChange(change.roomId, change.newHost.socketId, change.newHost.userId);
      } else {
        emitHostChange(change.roomId, null, null);
      }
    });
    if (participantRoomId && !participant?.hidden) {
      emitVisibleParticipants(participantRoomId);
    }
    recordingSessionManager.releaseRecorderSocket(socket.id).forEach((session) => {
      void persistRecordingSessionState(session.id).catch((error) => {
        console.error(`[Room ${session.roomId}] Failed to persist released recorder session:`, error);
      });
      emitRecordingSession(session.roomId);
    });
    console.log('[WebSocket] User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3002;

async function start() {
  requireEnv('JWT_SECRET');
  await initializeDatabase();
  await hydrateRecordingSessionsFromDatabase();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
  });
}

start().catch((error) => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
});
