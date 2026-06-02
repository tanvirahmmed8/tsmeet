import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import calendarRoutes from './routes/calendars';
import bookingRoutes from './routes/bookings';
import publicCalendarRoutes from './routes/publicCalendars';
import { initializeDatabase, pool } from './db';
import { authenticateToken } from './middleware/auth';
import { RoomManager } from './services/roomManager';

dotenv.config();

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

// WebSocket/Socket.IO Events
const roomManager = new RoomManager();

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

      if (!existingHost?.socketId && isHost && creatorId === joiningUserId && effectiveAuthenticatedUserId === joiningUserId) {
        roomManager.setHost(roomId, socket.id, joiningUserId);
      }

      const host = roomManager.getHost(roomId);
      const isRoomHost = host?.socketId === socket.id;

      if (isRoomHost) {
        socket.join(roomId);
        roomManager.addUserToRoom(roomId, joiningUserId, socket.id, userData);

        socket.emit('join-approved', { roomId, isHost: true });

        const participants = roomManager.getRoomParticipants(roomId);
        socket.emit('room-participants', participants.filter((p) => p.socketId !== socket.id));

        socket.to(roomId).emit('user-joined', {
          userId: joiningUserId,
          socketId: socket.id,
          userData,
        });

        emitHostChange(roomId, socket.id, joiningUserId);

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

  const approveUser = (roomId: string, targetSocketId: string) => {
    const pending = roomManager.getPendingBySocket(roomId, targetSocketId);
    if (!pending) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    roomManager.removePending(roomId, targetSocketId);

    if (!targetSocket) return;

    targetSocket.join(roomId);
    roomManager.addUserToRoom(roomId, pending.userId, targetSocketId, pending.userData);

    targetSocket.emit('join-approved', { roomId, isHost: false });

    const participants = roomManager.getRoomParticipants(roomId);
    targetSocket.emit('room-participants', participants.filter((p) => p.socketId !== targetSocketId));

    targetSocket.to(roomId).emit('user-joined', {
      userId: pending.userId,
      socketId: targetSocketId,
      userData: pending.userData,
    });
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
    io.to(targetSocketId).emit('receive-offer', {
      socketId: socket.id,
      offer,
    });
  });

  // WebRTC: Send answer
  socket.on('send-answer', (data: any) => {
    const { roomId, targetSocketId, answer } = data;
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    io.to(targetSocketId).emit('receive-answer', {
      socketId: socket.id,
      answer,
    });
  });

  // WebRTC: Send ICE candidates
  socket.on('send-ice-candidate', (data: any) => {
    const { roomId, targetSocketId, candidate } = data;
    if (!roomId || !targetSocketId || !isParticipantAndTargetInRoom(roomId, targetSocketId)) return;
    io.to(targetSocketId).emit('receive-ice-candidate', {
      socketId: socket.id,
      candidate,
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
    socket.to(roomId).emit('user-left', { socketId: socket.id, userId: participant?.userId || userId });
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
    roomManager.removeUserBySocketId(socket.id);
    const hostChanges = roomManager.handleHostDisconnect(socket.id);
    hostChanges.forEach((change) => {
      if (change.newHost) {
        emitHostChange(change.roomId, change.newHost.socketId, change.newHost.userId);
      } else {
        emitHostChange(change.roomId, null, null);
      }
    });
    console.log('[WebSocket] User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3002;

async function start() {
  await initializeDatabase();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`📍 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
  });
}

start().catch((error) => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
});
