import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { pool } from '../db';
import { createUserRecordingRoutes } from '../routes/recordings';
import { RecordingSessionManager } from '../services/recordingSessionManager';

test('recording start fails with HTTP 507 before Egress when storage is full', async () => {
  const originalQuery = pool.query;
  const originalQuota = process.env.RECORDING_STORAGE_QUOTA_BYTES;
  process.env.RECORDING_STORAGE_QUOTA_BYTES = '0';
  (pool as any).query = async (sql: string) => {
    if (sql.includes('SELECT * FROM rooms')) {
      return { rows: [{ id: 'full-storage-room', creator_id: 'creator' }] };
    }
    if (sql.includes('SUM(recording_segments.size_bytes)')) {
      return { rows: [{ used_bytes: 0 }] };
    }
    throw new Error(`Unexpected database query: ${sql}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'creator';
    next();
  });
  const server = createServer(app);
  const io = new SocketServer(server);
  app.use('/recordings', createUserRecordingRoutes(io, new RecordingSessionManager()));

  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const response = await fetch(`http://127.0.0.1:${address.port}/recordings/sessions/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: 'full-storage-room', consentConfirmed: true }),
    });
    assert.equal(response.status, 507);
    assert.deepEqual(await response.json(), {
      error: 'Recording storage quota exceeded',
      code: 'RECORDING_STORAGE_FULL',
    });
  } finally {
    await io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    (pool as any).query = originalQuery;
    if (originalQuota === undefined) delete process.env.RECORDING_STORAGE_QUOTA_BYTES;
    else process.env.RECORDING_STORAGE_QUOTA_BYTES = originalQuota;
  }
});
