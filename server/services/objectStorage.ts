import { DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { pool } from '../db';

export class StorageQuotaExceededError extends Error {
  constructor() {
    super('Recording storage quota exceeded');
    this.name = 'StorageQuotaExceededError';
  }
}

export function assertRecordingStorageCapacity(usedBytes: number, limitBytes: number) {
  if (!Number.isFinite(limitBytes) || limitBytes < 0) {
    throw new Error('RECORDING_STORAGE_QUOTA_BYTES must be a non-negative number');
  }
  if (usedBytes >= limitBytes) throw new StorageQuotaExceededError();
  return { usedBytes, limitBytes };
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function clientFor(endpointValue: string) {
  const endpoint = new URL(endpointValue);
  return new S3Client({
    endpoint: endpoint.origin,
    forcePathStyle: true,
    region: process.env.MINIO_REGION || 'us-east-1',
    credentials: {
      accessKeyId: required('MINIO_ACCESS_KEY'),
      secretAccessKey: required('MINIO_SECRET_KEY'),
    },
  });
}

export async function createRecordingDownloadUrl(objectKey: string, expiresSeconds = 300) {
  const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || required('MINIO_ENDPOINT');
  const client = clientFor(endpoint);
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: required('MINIO_BUCKET'), Key: objectKey,
    }), { expiresIn: expiresSeconds });
  } finally {
    client.destroy();
  }
}

export async function removeRecordingObjects(objectKeys: string[]) {
  if (objectKeys.length === 0) return;
  const client = clientFor(required('MINIO_ENDPOINT'));
  try {
    // S3 accepts at most 1,000 keys per request, including on MinIO.
    for (let offset = 0; offset < objectKeys.length; offset += 1000) {
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: required('MINIO_BUCKET'),
        Delete: { Objects: objectKeys.slice(offset, offset + 1000).map((Key) => ({ Key })), Quiet: true },
      }));
      // A successful HTTP response can still contain individual deletion errors.
      // Do not discard recording metadata when any storage deletion failed.
      if (result.Errors?.length) throw new Error('Recording object deletion failed');
    }
  } finally {
    client.destroy();
  }
}

export async function enforceRecordingRetention() {
  const expired = await pool.query<any>(
    `SELECT id FROM recordings
     WHERE retention_until IS NOT NULL AND retention_until <= NOW()`
  );
  for (const recording of expired.rows) {
    const segments = await pool.query<any>(
      'SELECT object_key FROM recording_segments WHERE recording_id = $1',
      [recording.id]
    );
    await removeRecordingObjects(segments.rows.map((row) => String(row.object_key)));
    await pool.query('DELETE FROM recording_sessions WHERE id = $1', [recording.id]);
    await pool.query('DELETE FROM recordings WHERE id = $1', [recording.id]);
  }
  return expired.rows.length;
}

export async function assertStorageQuotaAvailable(creatorId: string) {
  const limit = Number(process.env.RECORDING_STORAGE_QUOTA_BYTES || 100 * 1024 * 1024 * 1024);
  const usage = await pool.query<any>(
    `SELECT COALESCE(SUM(recording_segments.size_bytes), 0) AS used_bytes
     FROM recording_segments
     INNER JOIN recordings ON recordings.id = recording_segments.recording_id
     WHERE recordings.creator_id = $1`,
    [creatorId]
  );
  const used = Number(usage.rows[0]?.used_bytes || 0);
  return assertRecordingStorageCapacity(used, limit);
}

export async function checkObjectStorageHealth() {
  const client = clientFor(required('MINIO_ENDPOINT'));
  try {
    await client.send(new HeadBucketCommand({ Bucket: required('MINIO_BUCKET') }));
    return true;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw error;
  } finally {
    client.destroy();
  }
}
