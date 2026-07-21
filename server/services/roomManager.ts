interface Participant {
  userId: string;
  socketId: string;
  userData: {
    name: string;
    avatar?: string;
  };
  joinedAt: Date;
  hidden?: boolean;
  role?: 'user' | 'recorder';
}

interface Room {
  roomId: string;
  // Keyed by socketId to allow multiple concurrent connections per user.
  participants: Map<string, Participant>;
  pending: Map<string, Participant>;
  hostSocketId?: string;
  hostUserId?: string;
  coHosts: Set<string>; // userIds of co-hosts
  createdAt: Date;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  private ensureRoom(roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        participants: new Map(),
        pending: new Map(),
        coHosts: new Set(),
        createdAt: new Date(),
      });
    }

    return this.rooms.get(roomId)!;
  }

  addUserToRoom(roomId: string, userId: string, socketId: string, userData: any, options?: { hidden?: boolean; role?: 'user' | 'recorder' }) {
    const room = this.ensureRoom(roomId);
    room.participants.set(socketId, {
      userId,
      socketId,
      userData,
      joinedAt: new Date(),
      hidden: options?.hidden ?? false,
      role: options?.role ?? 'user',
    });
  }

  setHost(roomId: string, socketId: string, userId: string) {
    const room = this.ensureRoom(roomId);
    room.hostSocketId = socketId;
    room.hostUserId = userId;
  }

  getHost(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? { socketId: room.hostSocketId, userId: room.hostUserId } : null;
  }

  isCoHost(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    return room ? room.coHosts.has(userId) : false;
  }

  addCoHost(roomId: string, userId: string) {
    const room = this.ensureRoom(roomId);
    room.coHosts.add(userId);
  }

  removeCoHost(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.coHosts.delete(userId);
    }
  }

  getParticipant(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    return room ? room.participants.get(socketId) || null : null;
  }

  addPending(roomId: string, userId: string, socketId: string, userData: any) {
    const room = this.ensureRoom(roomId);
    room.pending.set(socketId, {
      userId,
      socketId,
      userData,
      joinedAt: new Date(),
    });
  }

  removePending(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.pending.delete(socketId);
  }

  getPending(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.pending.values()) : [];
  }

  getPendingBySocket(roomId: string, socketId: string): Participant | null {
    const room = this.rooms.get(roomId);
    return room ? room.pending.get(socketId) || null : null;
  }

  removeUserFromRoom(roomId: string, socketId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.participants.delete(socketId);
      if (room.participants.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  removeUserBySocketId(socketId: string) {
    for (const room of this.rooms.values()) {
      for (const [participantSocketId, participant] of room.participants.entries()) {
        if (participant.socketId === socketId) {
          room.participants.delete(participantSocketId);
          if (room.participants.size === 0) {
            this.rooms.delete(room.roomId);
          }
          return;
        }
      }

      if (room.pending.has(socketId)) {
        room.pending.delete(socketId);
        if (room.pending.size === 0 && room.participants.size === 0) {
          this.rooms.delete(room.roomId);
        }
        return;
      }
    }
  }

  getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.participants.values()) : [];
  }

  getVisibleParticipants(roomId: string): Participant[] {
    return this.getRoomParticipants(roomId).filter((participant) => !participant.hidden);
  }

  addHiddenRecorder(roomId: string, socketId: string, serviceInstanceId: string) {
    this.addUserToRoom(
      roomId,
      `recorder:${serviceInstanceId}`,
      socketId,
      { name: 'Hidden Recorder', serviceInstanceId },
      { hidden: true, role: 'recorder' }
    );
  }

  getRoomSize(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.participants.size : 0;
  }

  userExists(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    for (const participant of room.participants.values()) {
      if (participant.userId === userId) return true;
    }
    return false;
  }

  getAllRooms() {
    return Array.from(this.rooms.values()).map((room) => ({
      roomId: room.roomId,
      participantCount: room.participants.size,
      pendingCount: room.pending.size,
      hostSocketId: room.hostSocketId,
      createdAt: room.createdAt,
    }));
  }

  handleHostDisconnect(socketId: string) {
    const changes: Array<{ roomId: string; newHost?: Participant }> = [];
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) {
        const next = Array.from(room.participants.values()).find((participant) => !participant.hidden);
        if (next) {
          room.hostSocketId = next.socketId;
          room.hostUserId = next.userId;
          changes.push({ roomId: room.roomId, newHost: next });
        } else {
          room.hostSocketId = undefined;
          room.hostUserId = undefined;
          changes.push({ roomId: room.roomId });
        }
      }
    }
    return changes;
  }

  transferHost(roomId: string, targetSocketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const target = room.participants.get(targetSocketId);
    if (!target) return null;

    room.hostSocketId = target.socketId;
    room.hostUserId = target.userId;
    return target;
  }

  endRoom(roomId: string) {
    this.rooms.delete(roomId);
  }
}
