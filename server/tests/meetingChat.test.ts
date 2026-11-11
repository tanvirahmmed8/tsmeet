import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Server } from 'socket.io';
import { io as client, type Socket } from 'socket.io-client';
import { RoomManager } from '../services/roomManager';
import { registerMeetingChat } from '../services/meetingChat';
import type { MeetingChatMessage } from '../contracts/meetingChat';

function nextMessage(socket: Socket) {
  return new Promise<MeetingChatMessage>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message not received')), 3000);
    socket.once('receive-message', (message: MeetingChatMessage) => { clearTimeout(timer); resolve(message); });
  });
}

test('real Socket.IO chat: room-scoped broadcast, identity, validation, duplicate suppression and reconnect', { timeout: 15000 }, async () => {
  const http = createServer();
  const io = new Server(http);
  const rooms = new RoomManager();
  const clients: Socket[] = [];
  // Identity/admission are fixture-controlled here; production obtains identity
  // from verified JWT and RoomManager populated by its admission handlers.
  io.on('connection', (socket) => {
    const { user, room, admitted, recorder, authenticated } = socket.handshake.auth;
    if (admitted) {
      rooms.addUserToRoom(room, user, socket.id, { name: `Member ${user}` }, { hidden: recorder, role: recorder ? 'recorder' : 'user' });
      void socket.join(room);
    }
    let verifiedIdentity: string | null = authenticated === false ? null : user;
    socket.on('fixture-session-verified', (ack) => { verifiedIdentity = user; ack(); });
    registerMeetingChat(io, socket, rooms, () => verifiedIdentity);
    socket.on('disconnect', () => rooms.removeUserBySocketId(socket.id));
  });
  try {
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const address = http.address();
    assert.ok(address && typeof address !== 'string');
    const connect = async (user: string, room = 'room-a', admitted = true, recorder = false, authenticated = true) => {
      const socket = client(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'], forceNew: true, reconnection: false,
        auth: { user, room, admitted, recorder, authenticated },
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    };
    const host = await connect('host');
    const guest = await connect('guest');
    const other = await connect('other', 'room-b');
    const pending = await connect('pending', 'room-a', false);
    const recorder = await connect('recorder', 'room-a', true, true);
    const unauthenticated = await connect('anonymous', 'room-a', true, false, false);
    const seen: MeetingChatMessage[] = [];
    const outside: MeetingChatMessage[] = [];
    host.on('receive-message', (message) => seen.push(message));
    other.on('receive-message', (message) => outside.push(message));
    const send = (socket: Socket, value: unknown) => socket.timeout(2000).emitWithAck('send-message', value);
    const received = nextMessage(guest);
    const ack = await send(host, { roomId: 'room-a', message: ' Hello বাংলা ', senderName: 'Spoofed', timestamp: 'fake', clientMessageId: 'first' });
    const message = await received;
    assert.equal(ack.ok, true);
    assert.equal(message.message, 'Hello বাংলা');
    assert.equal(message.senderId, 'host');
    assert.equal(message.senderName, 'Member host');
    assert.ok(Number.isFinite(Date.parse(message.timestamp)));
    assert.equal(message.id, ack.id);
    assert.equal((await send(host, { roomId: 'room-a', message: 'Hello', clientMessageId: 'first' })).id, ack.id);
    assert.equal(seen.length, 1);
    assert.equal(outside.length, 0);
    for (const value of [null, {}, { roomId: 'room-a', message: ' ' }, { roomId: 'room-a', message: 'x'.repeat(2001) }]) {
      assert.equal((await send(host, value)).ok, false);
    }
    for (const socket of [pending, recorder, unauthenticated, other]) {
      assert.equal((await send(socket, { roomId: 'room-a', message: 'Forbidden' })).ok, false);
    }
    await unauthenticated.timeout(2000).emitWithAck('fixture-session-verified');
    assert.equal((await send(unauthenticated, { roomId: 'room-a', message: 'After verified session fallback' })).ok, true);
    const reply = nextMessage(host);
    assert.equal((await send(guest, { roomId: 'room-a', message: 'Reply' })).ok, true);
    assert.equal((await reply).senderId, 'guest');
    const oldId = guest.id;
    guest.disconnect();
    const rejoined = await connect('guest');
    assert.notEqual(rejoined.id, oldId);
    const afterReconnect = nextMessage(host);
    assert.equal((await send(rejoined, { roomId: 'room-a', message: 'After reconnect' })).ok, true);
    assert.equal((await afterReconnect).message, 'After reconnect');
    for (let index = 0; index < 18; index++) await send(host, { roomId: 'room-a', message: `Burst ${index}` });
    await send(host, { roomId: 'room-a', message: 'Last allowed' });
    assert.equal((await send(host, { roomId: 'room-a', message: 'Rate limited' })).ok, false);
    rooms.removeUserFromRoom('room-a', rejoined.id!);
    assert.equal((await send(rejoined, { roomId: 'room-a', message: 'After removal' })).ok, false);
  } finally {
    clients.forEach((socket) => socket.disconnect());
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});
