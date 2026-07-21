export type MediaProvider = 'mesh' | 'livekit';

function roomSet(name: string) {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function mediaProviderForRoom(roomId: string): MediaProvider {
  const meshRooms = roomSet('MEDIA_PROVIDER_MESH_ROOMS');
  const livekitRooms = roomSet('MEDIA_PROVIDER_LIVEKIT_ROOMS');
  if (meshRooms.has(roomId)) return 'mesh';
  if (livekitRooms.has(roomId)) return 'livekit';
  return process.env.MEDIA_PROVIDER?.trim().toLowerCase() === 'mesh' ? 'mesh' : 'livekit';
}

export function meshIceServersFromEnvironment() {
  const servers: Array<{ urls: string; username?: string; credential?: string }> = [];
  const stun = process.env.STUN_SERVER?.trim();
  const turn = process.env.TURN_SERVER?.trim();
  if (stun) servers.push({ urls: stun });
  if (turn) {
    const username = process.env.TURN_USERNAME?.trim();
    const credential = process.env.TURN_PASSWORD?.trim();
    servers.push({
      urls: turn,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }
  return servers;
}
