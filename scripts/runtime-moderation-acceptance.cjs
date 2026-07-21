const { io } = require('socket.io-client');

const BACKEND = 'http://localhost:3002';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.error || 'request failed'}`);
  return body;
}

function once(socket, event, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function register(stamp, index) {
  return request(`${BACKEND}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: `moderation-probe-${stamp}-${index}@example.test`,
      password: 'RuntimeTest!4827',
      name: `Moderation Probe ${index}`,
    }),
  });
}

async function connect(account) {
  const socket = io(BACKEND, { transports: ['websocket'], auth: { token: account.token } });
  if (!socket.connected) await once(socket, 'connect');
  return socket;
}

async function join(socket, account, roomId, isHost = false) {
  const approved = once(socket, 'join-approved');
  socket.emit('request-join', {
    roomId,
    userId: String(account.user.id),
    userData: { name: account.user.name },
    isHost,
  });
  return approved;
}

(async () => {
  const stamp = Date.now();
  const [hostAccount, cohostAccount, guestAccount] = await Promise.all(
    [1, 2, 3].map((index) => register(stamp, index))
  );
  const room = await request(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hostAccount.token}` },
    body: JSON.stringify({ title: 'Moderation acceptance' }),
  });
  const sockets = [];
  try {
    let host = await connect(hostAccount); sockets.push(host);
    await join(host, hostAccount, room.id, true);

    const cohost = await connect(cohostAccount); sockets.push(cohost);
    const cohostRequest = once(host, 'join-request');
    cohost.emit('request-join', { roomId: room.id, userId: String(cohostAccount.user.id), userData: { name: cohostAccount.user.name } });
    const cohostPending = await cohostRequest;
    const cohostApproved = once(cohost, 'join-approved');
    host.emit('approve-join', { roomId: room.id, targetSocketId: cohostPending.socketId });
    await cohostApproved;

    const guest = await connect(guestAccount); sockets.push(guest);
    const guestRequest = once(host, 'join-request');
    guest.emit('request-join', { roomId: room.id, userId: String(guestAccount.user.id), userData: { name: guestAccount.user.name } });
    const guestPending = await guestRequest;
    const guestApproved = once(guest, 'join-approved');
    host.emit('approve-join', { roomId: room.id, targetSocketId: guestPending.socketId });
    await guestApproved;

    let unauthorizedMuteReceived = false;
    cohost.once('force-mute', () => { unauthorizedMuteReceived = true; });
    guest.emit('host-mute', { roomId: room.id, targetSocketId: cohost.id });
    await pause(750);

    const promoted = once(cohost, 'cohost-promoted');
    host.emit('promote-cohost', { roomId: room.id, targetSocketId: cohost.id });
    await promoted;

    cohost.disconnect();
    const reconnected = await connect(cohostAccount); sockets.push(reconnected);
    await join(reconnected, cohostAccount, room.id);

    const authorizedMute = once(guest, 'force-mute');
    reconnected.emit('host-mute', { roomId: room.id, targetSocketId: guest.id });
    await authorizedMute;

    host.disconnect();
    host = await connect(hostAccount); sockets.push(host);
    const reclaimed = await join(host, hostAccount, room.id, true);

    const endedForCohost = once(reconnected, 'meeting-ended');
    const endedForGuest = once(guest, 'meeting-ended');
    host.emit('end-meeting', { roomId: room.id });
    await Promise.all([endedForCohost, endedForGuest]);
    const tokenAfterEnd = await fetch(`${BACKEND}/api/media/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${guestAccount.token}` },
      body: JSON.stringify({ roomId: room.id, displayName: guestAccount.user.name }),
    });

    console.log(JSON.stringify({
      unauthorizedModerationBlocked: !unauthorizedMuteReceived,
      cohostRoleSurvivedReconnect: true,
      hostRoleReclaimedAfterReconnect: reclaimed.isHost === true,
      cohostModerationDelivered: true,
      meetingEndedDeliveredToEveryone: true,
      tokenAfterEndStatus: tokenAfterEnd.status,
    }));
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
