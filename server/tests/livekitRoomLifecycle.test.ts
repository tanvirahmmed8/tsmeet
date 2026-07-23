import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureLiveKitRoom, livekitRoomName } from '../services/livekit';

const roomId = '5ce29459-43e0-49d3-b050-d6d22092319e';
const roomName = livekitRoomName(roomId);

test('does not recreate a LiveKit room that already exists', async () => {
  let createCalls = 0;
  const client = {
    listRooms: async () => [{ name: roomName }],
    createRoom: async () => {
      createCalls += 1;
      return { name: roomName };
    },
  };

  await ensureLiveKitRoom(roomId, client as any);
  assert.equal(createCalls, 0);
});

test('recreates an expired empty LiveKit room for an authorized token request', async () => {
  let createCalls = 0;
  const client = {
    listRooms: async () => [],
    createRoom: async (options: { name: string; maxParticipants: number; emptyTimeout: number }) => {
      createCalls += 1;
      assert.deepEqual(options, {
        name: roomName,
        maxParticipants: 50,
        emptyTimeout: 300,
      });
      return { name: roomName };
    },
  };

  await ensureLiveKitRoom(roomId, client as any);
  assert.equal(createCalls, 1);
});

test('accepts a concurrent room-create race but propagates real failures', async () => {
  let listCalls = 0;
  const racedClient = {
    listRooms: async () => {
      listCalls += 1;
      return listCalls === 1 ? [] : [{ name: roomName }];
    },
    createRoom: async () => {
      throw new Error('already exists');
    },
  };
  await ensureLiveKitRoom(roomId, racedClient as any);

  const failedClient = {
    listRooms: async () => [],
    createRoom: async () => {
      throw new Error('LiveKit unavailable');
    },
  };
  await assert.rejects(() => ensureLiveKitRoom(roomId, failedClient as any), /LiveKit unavailable/);
});
