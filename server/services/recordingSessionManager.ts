import { v4 as uuidv4 } from 'uuid';

export type RecordingSessionStatus =
  | 'awaiting_recorder'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'failed';

export type RecordingSession = {
  id: string;
  roomId: string;
  creatorId: string;
  startedByUserId: string;
  status: RecordingSessionStatus;
  hiddenRecorderSocketId?: string | null;
  recorderServiceInstanceId?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  lastHeartbeatAt?: string | null;
  failureReason?: string | null;
};

export class RecordingSessionManager {
  private sessions = new Map<string, RecordingSession>();
  private activeByRoomId = new Map<string, string>();

  listSessions() {
    return Array.from(this.sessions.values());
  }

  hydrateSession(session: RecordingSession) {
    this.sessions.set(session.id, session);
    if (!['completed', 'failed'].includes(session.status)) {
      this.activeByRoomId.set(session.roomId, session.id);
    }
    return session;
  }

  createSession(roomId: string, creatorId: string, startedByUserId: string) {
    const activeId = this.activeByRoomId.get(roomId);
    if (activeId) {
      const existing = this.sessions.get(activeId);
      if (existing && !['completed', 'failed'].includes(existing.status)) {
        return existing;
      }
    }

    const now = new Date().toISOString();
    const session: RecordingSession = {
      id: uuidv4(),
      roomId,
      creatorId,
      startedByUserId,
      status: 'awaiting_recorder',
      hiddenRecorderSocketId: null,
      recorderServiceInstanceId: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      lastHeartbeatAt: null,
      failureReason: null,
    };
    this.sessions.set(session.id, session);
    this.activeByRoomId.set(roomId, session.id);
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) || null;
  }

  getActiveSessionForRoom(roomId: string) {
    const sessionId = this.activeByRoomId.get(roomId);
    return sessionId ? this.getSession(sessionId) : null;
  }

  claimSession(sessionId: string, serviceInstanceId: string, recorderSocketId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const now = new Date().toISOString();
    session.recorderServiceInstanceId = serviceInstanceId;
    session.hiddenRecorderSocketId = recorderSocketId;
    session.lastHeartbeatAt = now;
    if (session.status === 'awaiting_recorder' || session.status === 'recording') {
      session.status = 'recording';
    }
    session.updatedAt = now;
    return session;
  }

  heartbeat(sessionId: string, serviceInstanceId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.recorderServiceInstanceId !== serviceInstanceId) return null;
    session.lastHeartbeatAt = new Date().toISOString();
    session.updatedAt = session.lastHeartbeatAt;
    return session;
  }

  pauseSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = 'paused';
    session.updatedAt = new Date().toISOString();
    return session;
  }

  resumeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = 'recording';
    session.updatedAt = new Date().toISOString();
    return session;
  }

  stopSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = 'stopping';
    session.updatedAt = new Date().toISOString();
    return session;
  }

  completeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const now = new Date().toISOString();
    session.status = 'completed';
    session.updatedAt = now;
    session.completedAt = now;
    this.activeByRoomId.delete(session.roomId);
    return session;
  }

  failSession(sessionId: string, reason: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = 'failed';
    session.failureReason = reason;
    session.updatedAt = new Date().toISOString();
    this.activeByRoomId.delete(session.roomId);
    return session;
  }

  releaseRecorderSocket(socketId: string) {
    let changed: RecordingSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.hiddenRecorderSocketId === socketId && !['completed', 'failed'].includes(session.status)) {
        session.hiddenRecorderSocketId = null;
        session.recorderServiceInstanceId = null;
        session.status = 'awaiting_recorder';
        session.updatedAt = new Date().toISOString();
        changed.push(session);
      }
    }
    return changed;
  }
}
