import { AccessToken, RoomServiceClient, TrackSource, TrackType, type VideoGrant } from 'livekit-server-sdk';

export type MeetingRole = 'host' | 'co-host' | 'guest' | 'recorder';

function requiredEnv(name: 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET' | 'LIVEKIT_URL') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function browserLiveKitUrl() {
  return process.env.LIVEKIT_PUBLIC_URL?.trim() || requiredEnv('LIVEKIT_URL');
}

export function livekitRoomName(roomId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(roomId)) {
    throw new Error('Invalid room ID');
  }
  return `tsmeet-${roomId.toLowerCase()}`;
}

export function livekitIdentity(userId: string) {
  if (!/^\d+$/.test(userId)) throw new Error('Invalid user identity');
  return `user:${userId}`;
}

export function getRoomServiceClient() {
  const url = requiredEnv('LIVEKIT_URL').replace(/^ws/i, 'http');
  return new RoomServiceClient(
    url,
    requiredEnv('LIVEKIT_API_KEY'),
    requiredEnv('LIVEKIT_API_SECRET')
  );
}

type LiveKitRoomAdminClient = Pick<RoomServiceClient, 'listRooms' | 'createRoom'>;

function liveKitRoomOptions(roomId: string) {
  return {
    name: livekitRoomName(roomId),
    maxParticipants: 50,
    emptyTimeout: 300,
  };
}

export async function createLiveKitRoom(roomId: string) {
  return getRoomServiceClient().createRoom(liveKitRoomOptions(roomId));
}

export async function ensureLiveKitRoom(
  roomId: string,
  client: LiveKitRoomAdminClient = getRoomServiceClient()
) {
  const roomName = livekitRoomName(roomId);
  const existing = await client.listRooms([roomName]);
  if (existing.some((room) => room.name === roomName)) return;

  try {
    await client.createRoom(liveKitRoomOptions(roomId));
  } catch (error) {
    // Two authorized participants can request tokens concurrently after an
    // empty room expires. Accept the create race only if the room now exists.
    const raced = await client.listRooms([roomName]);
    if (!raced.some((room) => room.name === roomName)) throw error;
  }
}

export async function deleteLiveKitRoom(roomId: string) {
  await getRoomServiceClient().deleteRoom(livekitRoomName(roomId));
}

export async function updateLiveKitRole(roomId: string, userId: string, role: MeetingRole) {
  await getRoomServiceClient().updateParticipant(
    livekitRoomName(roomId),
    livekitIdentity(userId),
    JSON.stringify({ role, tsmeetUserId: userId }),
    {
      canPublish: role !== 'recorder',
      canSubscribe: true,
      canPublishData: role !== 'recorder',
      hidden: role === 'recorder',
      recorder: role === 'recorder',
    }
  );
}

export async function muteLiveKitParticipant(roomId: string, userId: string, source: 'microphone' | 'camera') {
  const client = getRoomServiceClient();
  const room = livekitRoomName(roomId);
  const identity = livekitIdentity(userId);
  const participant = await client.getParticipant(room, identity);
  const matching = participant.tracks.filter((track) =>
    source === 'microphone'
      ? track.type === TrackType.AUDIO && track.source === TrackSource.MICROPHONE
      : track.type === TrackType.VIDEO && track.source === TrackSource.CAMERA
  );
  await Promise.all(matching.map((track) => client.mutePublishedTrack(room, identity, track.sid, true)));
}

export async function removeLiveKitParticipant(roomId: string, userId: string) {
  await getRoomServiceClient().removeParticipant(livekitRoomName(roomId), livekitIdentity(userId));
}

export async function createParticipantToken(input: {
  roomId: string;
  userId: string;
  displayName: string;
  role: MeetingRole;
}) {
  const room = livekitRoomName(input.roomId);
  const identity = livekitIdentity(input.userId);
  const token = new AccessToken(
    requiredEnv('LIVEKIT_API_KEY'),
    requiredEnv('LIVEKIT_API_SECRET'),
    {
      identity,
      name: input.displayName,
      metadata: JSON.stringify({ role: input.role, tsmeetUserId: input.userId }),
      ttl: '5m',
    }
  );

  const grant: VideoGrant = {
    room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: input.role !== 'recorder',
    canPublishData: input.role !== 'recorder',
    roomAdmin: input.role === 'host' || input.role === 'co-host',
    hidden: input.role === 'recorder',
    recorder: input.role === 'recorder',
  };
  token.addGrant(grant);

  return {
    token: await token.toJwt(),
    url: browserLiveKitUrl(),
    room,
    identity,
    role: input.role,
    expiresInSeconds: 300,
  };
}
