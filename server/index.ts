import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import calendarRoutes from './routes/calendars';
import bookingRoutes from './routes/bookings';
import {
  createUserRecordingRoutes,
} from './routes/recordings';
import publicCalendarRoutes from './routes/publicCalendars';
import mediaRoutes from './routes/media';
import { initializeDatabase, pool } from './db';
import { authenticateToken } from './middleware/auth';
import { RoomManager } from './services/roomManager';
import { RecordingSessionManager } from './services/recordingSessionManager';
import { closeRedis, configureRedisAdapter, isRedisReady } from './services/redis';
import { requestContext } from './middleware/requestContext';
import { receiveLiveKitWebhook } from './routes/livekitWebhook';
import {
  deleteLiveKitRoom,
  muteLiveKitParticipant,
  removeLiveKitParticipant,
  updateLiveKitRole,
} from './services/livekit';
import { checkObjectStorageHealth, enforceRecordingRetention } from './services/objectStorage';
import { writeAuditLog } from './services/audit';
import { activeParticipants, activeRooms, metricsRegistry, networkQualityReports } from './services/metrics';
import { mediaProviderForRoom, meshIceServersFromEnvironment } from './services/mediaProvider';

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
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(requestContext);
app.post(
  '/api/webhooks/livekit',
  express.raw({ type: ['application/webhook+json', 'application/json'], limit: '256kb' }),
  receiveLiveKitWebhook
);
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/recorder-assets', express.static(path.join(process.cwd(), 'public', 'recorder')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', authenticateToken, roomRoutes);
app.use('/api/calendars', authenticateToken, calendarRoutes);
app.use('/api/bookings', authenticateToken, bookingRoutes);
app.use('/api/media', authenticateToken, mediaRoutes);
app.use('/api/public/calendars', publicCalendarRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
  const storage = await checkObjectStorageHealth().then((ready) => ready ? 'ready' : 'missing-bucket').catch(() => 'unavailable');
  res.json({ status: 'ok', redis: isRedisReady() ? 'ready' : 'disabled', storage, timestamp: new Date().toISOString() });
});

// WebSocket/Socket.IO Events
const roomManager = new RoomManager();
const recordingSessionManager = new RecordingSessionManager();
app.get('/metrics', async (_req, res) => {
  const rooms = roomManager.getAllRooms();
  activeRooms.set(rooms.length);
  activeParticipants.set(rooms.reduce((total, room) => total + room.participantCount, 0));
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});

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

io.on('connection', (socket) => {
  console.log('[WebSocket] User connected:', socket.id);
  const jwtSecret = process.env.JWT_SECRET;
  const authToken = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null;
  const bearerToken =
    typeof socket.handshake.headers?.authorization === 'string'
      ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
      : null;
  const cookieToken = socket.handshake.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('tsmeet_session='))
    ?.slice('tsmeet_session='.length) || null;
  const token = cookieToken || authToken || bearerToken;
  let authenticatedUserId: string | null = null;
  let authenticatedGuestRoomId: string | null = null;

  if (jwtSecret && token) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as {
        userId?: string | number;
        guest?: boolean;
        roomId?: string;
      };
      if (decoded?.userId !== undefined && decoded?.userId !== null) {
        authenticatedUserId = String(decoded.userId);
        authenticatedGuestRoomId =
          decoded.guest && typeof decoded.roomId === 'string' ? decoded.roomId : null;
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
  const audit = (roomId: string, action: string, targetUserId?: string, details?: Record<string, unknown>) => {
    void writeAuditLog({ roomId, actorUserId: authenticatedUserId, action, targetUserId, details })
      .catch((error) => console.error(`[Room ${roomId}] Failed to write audit log`, error));
  };

  // User requests to join a room (waiting room flow)
  socket.on('request-join', async (payload: any) => {
    const { roomId, userId, userData, isHost, token: payloadToken, roomPassword } = payload || {};
    if (!roomId || !userId) return;

    let effectiveAuthenticatedUserId = authenticatedUserId;
    let effectiveGuestRoomId = authenticatedGuestRoomId;
    if (!effectiveAuthenticatedUserId && jwtSecret && typeof payloadToken === 'string' && payloadToken) {
      try {
        const decoded = jwt.verify(payloadToken, jwtSecret) as {
          userId?: string | number;
          guest?: boolean;
          roomId?: string;
        };
        if (decoded?.userId !== undefined && decoded?.userId !== null) {
          effectiveAuthenticatedUserId = String(decoded.userId);
          effectiveGuestRoomId =
            decoded.guest && typeof decoded.roomId === 'string' ? decoded.roomId : null;
        }
      } catch {
        socket.emit('auth-error', { message: 'Invalid auth token' });
      }
    }

    if (!effectiveAuthenticatedUserId || effectiveAuthenticatedUserId !== String(userId)) {
      socket.emit('join-denied', {
        roomId,
        message: 'Your meeting session could not be authenticated. Sign in again and retry.',
      });
      return;
    }
    if (effectiveGuestRoomId && effectiveGuestRoomId !== String(roomId)) {
      socket.emit('join-denied', {
        roomId,
        message: 'This guest session belongs to a different meeting.',
      });
      return;
    }

    try {
      const roomResult = await pool.query('SELECT creator_id, ended_at, password_hash, is_locked FROM rooms WHERE id = $1', [roomId]);
      if (roomResult.rows.length === 0 || roomResult.rows[0].ended_at) {
        socket.emit('meeting-ended', { roomId });
        return;
      }

      const roomRecord = roomResult.rows[0];
      const creatorId = String(roomRecord.creator_id);
      const joiningUserId = String(userId);
      const existingHost = roomManager.getHost(roomId);

      if (roomRecord.is_locked && creatorId !== joiningUserId) {
        const approved = await pool.query(
          `SELECT status FROM meeting_waiting_participants
           WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
          [roomId, joiningUserId]
        );
        if (approved.rows.length === 0) {
          socket.emit('join-denied', { roomId, message: 'This meeting is locked' });
          return;
        }
      }

      // Validate password if required and user is not the creator
      if (roomRecord.password_hash && creatorId !== joiningUserId) {
        if (!roomPassword) {
          socket.emit('password-required', { roomId });
          return;
        }
        const isMatch = await bcrypt.compare(roomPassword, roomRecord.password_hash);
        if (!isMatch) {
          socket.emit('password-incorrect', { roomId });
          return;
        }
      }

      const MAX_PARTICIPANTS = Math.max(2, Number(process.env.MAX_PARTICIPANTS || 50));
      const currentParticipants = roomManager.getRoomParticipants(roomId).filter(p => !p.hidden).length;
      if (currentParticipants >= MAX_PARTICIPANTS && creatorId !== joiningUserId) {
        socket.emit('join-denied', { roomId, message: `Room is full (max ${MAX_PARTICIPANTS} participants)` });
        return;
      }

      // The authenticated room creator always reclaims host ownership after a
      // reconnect, even if a temporary fallback host was selected meanwhile.
      if (isHost && creatorId === joiningUserId && effectiveAuthenticatedUserId === joiningUserId) {
        roomManager.setHost(roomId, socket.id, joiningUserId);
      }

      const host = roomManager.getHost(roomId);
      const isRoomHost = host?.socketId === socket.id;

      if (isRoomHost) {
        socket.join(roomId);
        roomManager.addUserToRoom(roomId, joiningUserId, socket.id, userData);
        await pool.query(
          `INSERT INTO meeting_roles (room_id, user_id, role) VALUES ($1, $2, 'host')
           ON DUPLICATE KEY UPDATE role = 'host'`,
          [roomId, joiningUserId]
        );

        socket.emit('join-approved', {
          roomId,
          isHost: true,
          iceServers: mediaProviderForRoom(roomId) === 'mesh' ? meshIceServersFromEnvironment() : [],
        });

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

      const previousDecision = await pool.query<any>(
        'SELECT status FROM meeting_waiting_participants WHERE room_id = $1 AND user_id = $2',
        [roomId, joiningUserId]
      );
      roomManager.addPending(roomId, joiningUserId, socket.id, userData);
      await pool.query(
        `INSERT INTO meeting_waiting_participants
          (room_id, user_id, socket_id, user_data, status, requested_at, decided_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW(), NULL)
         ON DUPLICATE KEY UPDATE
           socket_id = VALUES(socket_id), user_data = VALUES(user_data),
           status = IF(status = 'approved', 'approved', 'pending'), requested_at = NOW()`,
        [roomId, joiningUserId, socket.id, JSON.stringify(userData || {})]
      );
      if (previousDecision.rows[0]?.status === 'approved') {
        await approveUser(roomId, socket.id);
        return;
      }
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
      socket.emit('join-denied', { roomId, message: 'The server could not process the join request.' });
    }
  });

  const approveUser = async (roomId: string, targetSocketId: string) => {
    const pending = roomManager.getPendingBySocket(roomId, targetSocketId);
    if (!pending) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    roomManager.removePending(roomId, targetSocketId);

    await pool.query(
      `UPDATE meeting_waiting_participants
       SET status = 'approved', decided_at = NOW() WHERE room_id = $1 AND user_id = $2`,
      [roomId, pending.userId]
    );
    await pool.query(
      `INSERT INTO meeting_roles (room_id, user_id, role) VALUES ($1, $2, 'guest')
       ON DUPLICATE KEY UPDATE role = IF(role = 'host', 'host', role)`,
      [roomId, pending.userId]
    );
    const persistedRole = await pool.query<any>(
      'SELECT role FROM meeting_roles WHERE room_id = $1 AND user_id = $2',
      [roomId, pending.userId]
    );
    if (persistedRole.rows[0]?.role === 'co-host') {
      roomManager.addCoHost(roomId, pending.userId);
    }

    if (!targetSocket) return;

    targetSocket.join(roomId);
    roomManager.addUserToRoom(roomId, pending.userId, targetSocketId, pending.userData);

    targetSocket.emit('join-approved', {
      roomId,
      isHost: false,
      iceServers: mediaProviderForRoom(roomId) === 'mesh' ? meshIceServersFromEnvironment() : [],
    });

    const participants = roomManager.getVisibleParticipants(roomId);
    targetSocket.emit('room-participants', participants.filter((p) => p.socketId !== targetSocketId));

    targetSocket.to(roomId).emit('user-joined', {
      userId: pending.userId,
      socketId: targetSocketId,
      userData: pending.userData,
    });

    emitVisibleParticipants(roomId);
  };

  socket.on('approve-join', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;
    await approveUser(roomId, targetSocketId);
    audit(roomId, 'waiting.approved');
  });

  socket.on('deny-join', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;

    const target = roomManager.getPendingBySocket(roomId, targetSocketId);
    roomManager.removePending(roomId, targetSocketId);
    if (target) {
      await pool.query(
        `UPDATE meeting_waiting_participants SET status = 'denied', decided_at = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, target.userId]
      );
    }
    io.to(targetSocketId).emit('join-denied', { roomId });
    audit(roomId, 'waiting.denied', target?.userId);
  });

  socket.on('approve-all', async (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;

    const pending = roomManager.getPending(roomId);
    await Promise.all(pending.map((req) => approveUser(roomId, req.socketId)));
  });

  socket.on('host-mute', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;
    const target = roomManager.getParticipant(roomId, targetSocketId);
    if (!target) return;
    await muteLiveKitParticipant(roomId, target.userId, 'microphone').catch((error) =>
      console.warn(`[Room ${roomId}] LiveKit microphone mute failed`, error)
    );
    io.to(targetSocketId).emit('force-mute', { roomId });
    audit(roomId, 'participant.muted', target.userId);
  });

  socket.on('host-mute-all', async (payload: any) => {
    const { roomId } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;
    const targets = roomManager.getVisibleParticipants(roomId).filter((target) => target.socketId !== socket.id);
    await Promise.all(targets.map((target) =>
      muteLiveKitParticipant(roomId, target.userId, 'microphone').catch((error) =>
        console.warn(`[Room ${roomId}] LiveKit microphone mute failed`, error)
      )
    ));
    socket.to(roomId).emit('force-mute', { roomId });
    audit(roomId, 'room.muted_all');
  });

  socket.on('host-stop-video', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    const participant = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = participant && roomManager.isCoHost(roomId, participant.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;
    const target = roomManager.getParticipant(roomId, targetSocketId);
    if (!target) return;
    await muteLiveKitParticipant(roomId, target.userId, 'camera').catch((error) =>
      console.warn(`[Room ${roomId}] LiveKit camera mute failed`, error)
    );
    io.to(targetSocketId).emit('force-video-off', { roomId });
    audit(roomId, 'participant.video_disabled', target.userId);
  });

  socket.on('remove-participant', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    const host = roomManager.getHost(roomId);
    const moderator = roomManager.getParticipant(roomId, socket.id);
    const isCoHost = moderator && roomManager.isCoHost(roomId, moderator.userId);
    if ((!host || host.socketId !== socket.id) && !isCoHost) return;
    if (host?.socketId === targetSocketId) return;
    const target = roomManager.getParticipant(roomId, targetSocketId);
    if (!target) return;

    await pool.query(
      `UPDATE meeting_waiting_participants SET status = 'denied', decided_at = NOW()
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, target.userId]
    );
    await removeLiveKitParticipant(roomId, target.userId).catch((error) =>
      console.warn(`[Room ${roomId}] LiveKit participant removal failed`, error)
    );
    roomManager.removeUserFromRoom(roomId, targetSocketId);
    io.to(targetSocketId).emit('participant-removed', { roomId });
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    targetSocket?.leave(roomId);
    socket.to(roomId).emit('user-left', { socketId: targetSocketId, userId: target.userId });
    emitVisibleParticipants(roomId);
    audit(roomId, 'participant.removed', target.userId);
  });

  socket.on('set-meeting-lock', async (payload: any) => {
    const { roomId, locked } = payload || {};
    if (!roomId || typeof locked !== 'boolean') return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    await pool.query('UPDATE rooms SET is_locked = $1 WHERE id = $2', [locked, roomId]);
    io.to(roomId).emit('meeting-lock-changed', { roomId, locked });
    audit(roomId, locked ? 'room.locked' : 'room.unlocked');
  });

  socket.on('transfer-host', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;

    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;

    const nextHost = roomManager.transferHost(roomId, targetSocketId);
    if (!nextHost) return;

    await pool.query(
      `UPDATE meeting_roles SET role = 'co-host' WHERE room_id = $1 AND user_id = $2 AND role = 'host'`,
      [roomId, host.userId]
    );
    await pool.query(
      `INSERT INTO meeting_roles (room_id, user_id, role) VALUES ($1, $2, 'host')
       ON DUPLICATE KEY UPDATE role = 'host'`,
      [roomId, nextHost.userId]
    );
    await Promise.all([
      updateLiveKitRole(roomId, String(host.userId), 'co-host'),
      updateLiveKitRole(roomId, nextHost.userId, 'host'),
    ]).catch((error) => console.warn(`[Room ${roomId}] LiveKit host transfer sync failed`, error));

    emitHostChange(roomId, nextHost.socketId, nextHost.userId);
    audit(roomId, 'role.host_transferred', nextHost.userId);
  });

  socket.on('promote-cohost', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    const target = roomManager.getParticipant(roomId, targetSocketId);
    if (!target) return;
    roomManager.addCoHost(roomId, target.userId);
    await pool.query(
      `INSERT INTO meeting_roles (room_id, user_id, role) VALUES ($1, $2, 'co-host')
       ON DUPLICATE KEY UPDATE role = 'co-host'`,
      [roomId, target.userId]
    );
    await updateLiveKitRole(roomId, target.userId, 'co-host').catch((error) =>
      console.warn(`[Room ${roomId}] LiveKit co-host promotion sync failed`, error)
    );
    io.to(roomId).emit('cohost-promoted', { userId: target.userId, socketId: targetSocketId });
    audit(roomId, 'role.cohost_promoted', target.userId);
  });

  socket.on('demote-cohost', async (payload: any) => {
    const { roomId, targetSocketId } = payload || {};
    if (!roomId || !targetSocketId) return;
    const host = roomManager.getHost(roomId);
    if (!host || host.socketId !== socket.id) return;
    const target = roomManager.getParticipant(roomId, targetSocketId);
    if (!target) return;
    roomManager.removeCoHost(roomId, target.userId);
    await pool.query(
      `INSERT INTO meeting_roles (room_id, user_id, role) VALUES ($1, $2, 'guest')
       ON DUPLICATE KEY UPDATE role = 'guest'`,
      [roomId, target.userId]
    );
    await updateLiveKitRole(roomId, target.userId, 'guest').catch((error) =>
      console.warn(`[Room ${roomId}] LiveKit co-host demotion sync failed`, error)
    );
    io.to(roomId).emit('cohost-demoted', { userId: target.userId, socketId: targetSocketId });
    audit(roomId, 'role.cohost_demoted', target.userId);
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

  socket.on('network-quality', (payload: any) => {
    const { roomId, quality } = payload || {};
    if (!roomId || !isParticipant(roomId, socket.id)) return;
    if (!['excellent', 'good', 'poor', 'unknown'].includes(quality)) return;
    networkQualityReports.inc({ quality });
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

  // Temporary mesh rollback signaling. Both sender and target must be approved
  // participants in the same room; clients cannot use this as a general relay.
  socket.on('send-offer', (payload: any) => {
    const { roomId, targetSocketId, offer, hidden } = payload || {};
    if (!roomId || !targetSocketId || !offer) return;
    if (!isParticipant(roomId, socket.id) || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    io.to(targetSocketId).emit('receive-offer', { socketId: socket.id, offer, hidden: Boolean(hidden) });
  });

  socket.on('send-answer', (payload: any) => {
    const { roomId, targetSocketId, answer } = payload || {};
    if (!roomId || !targetSocketId || !answer) return;
    if (!isParticipant(roomId, socket.id) || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    io.to(targetSocketId).emit('receive-answer', { socketId: socket.id, answer });
  });

  socket.on('send-ice-candidate', (payload: any) => {
    const { roomId, targetSocketId, candidate } = payload || {};
    if (!roomId || !targetSocketId || !candidate) return;
    if (!isParticipant(roomId, socket.id) || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    io.to(targetSocketId).emit('receive-ice-candidate', { socketId: socket.id, candidate });
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
      const roomSockets = await io.in(roomId).fetchSockets();
      roomSockets.forEach((roomSocket) => {
        roomSocket.emit('meeting-ended', { roomId });
      });

      await deleteLiveKitRoom(roomId).catch((error) => {
        console.warn(`[Room ${roomId}] LiveKit room deletion failed`, error);
      });
      roomManager.endRoom(roomId);

      console.log(`[Room ${roomId}] Meeting ended by host ${host.userId}`);
      audit(roomId, 'room.ended');
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
  await configureRedisAdapter(io);
  await enforceRecordingRetention().catch((error) =>
    console.warn('[recordings] initial retention cleanup failed', error)
  );
  setInterval(() => {
    void enforceRecordingRetention().catch((error) =>
      console.warn('[recordings] scheduled retention cleanup failed', error)
    );
  }, 24 * 60 * 60 * 1000).unref();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
  });
}

async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received`);
  io.close();
  await closeRedis();
  await pool.end();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
});
