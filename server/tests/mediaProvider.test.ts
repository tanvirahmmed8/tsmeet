import assert from 'node:assert/strict';
import test from 'node:test';
import { mediaProviderForRoom, meshIceServersFromEnvironment } from '../services/mediaProvider';

const variableNames = [
  'MEDIA_PROVIDER',
  'MEDIA_PROVIDER_MESH_ROOMS',
  'MEDIA_PROVIDER_LIVEKIT_ROOMS',
] as const;

function withMediaProviderEnv(
  values: Partial<Record<(typeof variableNames)[number], string>>,
  assertion: () => void
) {
  const original = Object.fromEntries(variableNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of variableNames) delete process.env[name];
    Object.assign(process.env, values);
    assertion();
  } finally {
    for (const name of variableNames) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('LiveKit is the safe default media provider', () => {
  withMediaProviderEnv({}, () => assert.equal(mediaProviderForRoom('room-a'), 'livekit'));
});

test('the global media provider can select mesh', () => {
  withMediaProviderEnv({ MEDIA_PROVIDER: 'mesh' }, () => {
    assert.equal(mediaProviderForRoom('room-a'), 'mesh');
  });
});

test('per-room assignments override the global media provider', () => {
  withMediaProviderEnv(
    {
      MEDIA_PROVIDER: 'mesh',
      MEDIA_PROVIDER_LIVEKIT_ROOMS: ' livekit-room, another-room ',
      MEDIA_PROVIDER_MESH_ROOMS: 'mesh-room',
    },
    () => {
      assert.equal(mediaProviderForRoom('livekit-room'), 'livekit');
      assert.equal(mediaProviderForRoom('mesh-room'), 'mesh');
      assert.equal(mediaProviderForRoom('unassigned-room'), 'mesh');
    }
  );
});

test('mesh ICE configuration is derived from server environment', () => {
  const original = {
    stun: process.env.STUN_SERVER,
    turn: process.env.TURN_SERVER,
    username: process.env.TURN_USERNAME,
    password: process.env.TURN_PASSWORD,
  };
  try {
    process.env.STUN_SERVER = 'stun:stun.example.test:3478';
    process.env.TURN_SERVER = 'turn:turn.example.test:3478';
    process.env.TURN_USERNAME = 'runtime-user';
    process.env.TURN_PASSWORD = 'runtime-password';
    assert.deepEqual(meshIceServersFromEnvironment(), [
      { urls: 'stun:stun.example.test:3478' },
      {
        urls: 'turn:turn.example.test:3478',
        username: 'runtime-user',
        credential: 'runtime-password',
      },
    ]);
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('STUN_SERVER', original.stun);
    restore('TURN_SERVER', original.turn);
    restore('TURN_USERNAME', original.username);
    restore('TURN_PASSWORD', original.password);
  }
});
