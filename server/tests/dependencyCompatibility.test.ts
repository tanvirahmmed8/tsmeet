import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { guestSchema, loginSchema, registerSchema } from '../services/authValidation';
import { checkObjectStorageHealth, createRecordingDownloadUrl, removeRecordingObjects } from '../services/objectStorage';
import { activeRooms, httpRequestDuration, metricsRegistry, recordingFailures } from '../services/metrics';

test('replacement Prometheus client preserves application metric names and exposition', async () => {
  activeRooms.set(2);
  recordingFailures.inc();
  httpRequestDuration.observe({ method: 'GET', route: '/test', status: '200' }, 0.1);
  const output = await metricsRegistry.metrics();
  assert.match(metricsRegistry.contentType, /text\/plain/);
  assert.match(output, /tsmeet_active_rooms 2/);
  assert.match(output, /tsmeet_recording_failures_total 1/);
  assert.match(output, /tsmeet_http_request_duration_seconds_count\{method="GET",route="\/test",status="200"\} 1/);
});

test('bcrypt 3 accepts legacy bcrypt 2 hashes and uuid runs in the CommonJS server', async () => {
  // Generated with bcryptjs 2.4.3; test data only, never an account credential.
  const legacyHash = '$2a$04$E8fudJlVWUrh7xIatz3yUOgTQQnkjcSLXik7gm5Ap87a6DZefwRXm';
  assert.equal(await bcrypt.compare('legacy-test-password', legacyHash), true);
  assert.equal(await bcrypt.compare('incorrect', legacyHash), false);
  const generated = await bcrypt.hash('new-test-password', 4);
  assert.equal(await bcrypt.compare('new-test-password', generated), true);
  assert.equal(validateUuid(uuidv4()), true);
});

test('Zod upgrade preserves account and guest validation', () => {
  assert.deepEqual(registerSchema.parse({ email: ' HOST@example.com ', name: ' Host ', password: '12345678' }), {
    email: 'host@example.com', name: 'Host', password: '12345678',
  });
  assert.equal(registerSchema.safeParse({ email: 'bad', name: 'Host', password: '12345678' }).success, false);
  assert.equal(registerSchema.safeParse({ email: 'a@b.com', name: ' ', password: 'short' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) }).success, false);
  assert.equal(guestSchema.safeParse({ roomId: 'not-a-uuid', name: 'Guest' }).success, false);
  assert.deepEqual(guestSchema.parse({ roomId: '3d34b1a6-8b67-4e99-b589-a71cdc6d6c8c', name: ' Guest ' }).name, 'Guest');
});

test('React Hook Form resolver supports the upgraded Zod version', async () => {
  const resolver = zodResolver(z.object({ name: z.string().min(1) }));
  const options = { fields: {}, shouldUseNativeValidation: false };
  assert.deepEqual((await resolver({ name: 'Host' }, undefined, options)).errors, {});
  assert.ok((await resolver({ name: '' }, undefined, options)).errors.name);
});

test('S3 client keeps self-hosted MinIO signing, deletion and health semantics', async () => {
  const names = ['MINIO_ENDPOINT', 'MINIO_PUBLIC_ENDPOINT', 'MINIO_REGION', 'MINIO_BUCKET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let headStatus = 200;
  let deletionError = false;
  const deletions: string[] = [];
  const server = createServer(async (req, res) => {
    assert.match(req.url || '', /^\/recordings\/?(?:\?|$)/);
    if (req.method === 'HEAD') {
      res.writeHead(headStatus).end();
      return;
    }
    assert.equal(req.method, 'POST');
    assert.ok(req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 '));
    let body = '';
    for await (const chunk of req) body += String(chunk);
    deletions.push(body);
    res.setHeader('Content-Type', 'application/xml');
    res.end(deletionError
      ? '<DeleteResult><Error><Key>blocked</Key><Code>AccessDenied</Code></Error></DeleteResult>'
      : '<DeleteResult/>');
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    Object.assign(process.env, {
      MINIO_ENDPOINT: `http://127.0.0.1:${address.port}`,
      MINIO_PUBLIC_ENDPOINT: 'https://storage.example.test:9443',
      MINIO_BUCKET: 'recordings', MINIO_REGION: 'us-east-1',
      MINIO_ACCESS_KEY: 'test-access-key', MINIO_SECRET_KEY: 'test-secret-key',
    });
    const url = new URL(await createRecordingDownloadUrl('room/a b.mp4', 120));
    assert.equal(url.origin, 'https://storage.example.test:9443');
    assert.equal(url.pathname, '/recordings/room/a%20b.mp4');
    assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
    assert.ok(url.searchParams.get('X-Amz-Signature'));
    await removeRecordingObjects([]);
    assert.equal(deletions.length, 0);
    await removeRecordingObjects(Array.from({ length: 1001 }, (_, index) => `part-${index}`));
    assert.equal(deletions.length, 2);
    assert.equal((deletions[0].match(/<Key>/g) || []).length, 1000);
    assert.equal((deletions[1].match(/<Key>/g) || []).length, 1);
    deletionError = true;
    await assert.rejects(removeRecordingObjects(['blocked']), /Recording object deletion failed/);
    assert.equal(await checkObjectStorageHealth(), true);
    headStatus = 404;
    assert.equal(await checkObjectStorageHealth(), false);
    headStatus = 403;
    await assert.rejects(checkObjectStorageHealth());
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
