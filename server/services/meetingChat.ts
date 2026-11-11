import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { MAX_CHAT_LENGTH, type MeetingChatMessage } from '../contracts/meetingChat';
import type { RoomManager } from './roomManager';

export function registerMeetingChat(io: Server, socket: Socket, rooms: RoomManager, getAuthenticatedUserId: () => string | null) {
  const recent = new Map<string, MeetingChatMessage>();
  let windowStart = Date.now();
  let sent = 0;
  socket.on('send-message', (value: unknown, acknowledge?: unknown) => {
    const ack = typeof acknowledge === 'function' ? acknowledge : () => {};
    const data = value as { roomId?: unknown; message?: unknown; clientMessageId?: unknown } | null;
    if (!data || typeof data.roomId !== 'string' || !data.roomId ||
      typeof data.message !== 'string' || !data.message.trim() || data.message.length > MAX_CHAT_LENGTH ||
      (data.clientMessageId !== undefined && (typeof data.clientMessageId !== 'string' || !/^[\w-]{1,100}$/.test(data.clientMessageId)))) {
      ack({ ok: false, error: `Invalid message (maximum ${MAX_CHAT_LENGTH} characters).` });
      return;
    }
    const participant = rooms.getParticipant(data.roomId, socket.id);
    const authenticatedUserId = getAuthenticatedUserId();
    if (!authenticatedUserId || !participant || participant.hidden || participant.role === 'recorder' ||
      String(participant.userId) !== authenticatedUserId || !socket.rooms.has(data.roomId)) {
      ack({ ok: false, error: 'You must be admitted to this meeting to send messages.' });
      return;
    }
    const key = `${data.roomId}:${data.clientMessageId || randomUUID()}`;
    const duplicate = recent.get(key);
    if (duplicate) { ack({ ok: true, id: duplicate.id }); return; }
    if (Date.now() - windowStart >= 10_000) { windowStart = Date.now(); sent = 0; }
    if (sent >= 20) { ack({ ok: false, error: 'Too many messages. Please wait a moment.' }); return; }
    sent++;
    const message: MeetingChatMessage = {
      id: randomUUID(), roomId: data.roomId, socketId: socket.id,
      senderId: String(participant.userId), senderName: typeof participant.userData?.name === 'string'
        ? participant.userData.name.trim().slice(0, 191) || 'Guest' : 'Guest',
      message: data.message.trim(), timestamp: new Date().toISOString(),
    };
    recent.set(key, message);
    if (recent.size > 200) recent.delete(recent.keys().next().value!);
    io.to(data.roomId).emit('receive-message', message);
    ack({ ok: true, id: message.id });
  });
}
