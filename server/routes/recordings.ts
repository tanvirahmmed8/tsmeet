import express, { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../db';
import {
  RecordingSessionManager,
  RecordingSession,
} from '../services/recordingSessionManager';
import { startRoomRecording, stopRoomRecording } from '../services/egress';
import {
  assertStorageQuotaAvailable,
  createRecordingDownloadUrl,
  removeRecordingObjects,
  StorageQuotaExceededError,
} from '../services/objectStorage';
import { writeAuditLog } from '../services/audit';
import { recordingFailures } from '../services/metrics';

async function currentRecordingSegment(sessionId: string) {
  const result = await pool.query<any>(
    `SELECT * FROM recording_segments
     WHERE recording_id = $1 AND status = 'recording'
     ORDER BY segment_index DESC LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

async function startRecordingSegment(roomId: string, sessionId: string) {
  const count = await pool.query<any>(
    'SELECT COALESCE(MAX(segment_index), -1) + 1 AS next_index FROM recording_segments WHERE recording_id = $1',
    [sessionId]
  );
  const segment = Number(count.rows[0]?.next_index || 0);
  let started: Awaited<ReturnType<typeof startRoomRecording>> | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      started = await startRoomRecording(roomId, sessionId, segment);
      break;
    } catch (cause) {
      lastError = cause;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  if (!started) {
    recordingFailures.inc();
    throw lastError instanceof Error ? lastError : new Error('Egress failed after retries');
  }
  await pool.query(
    `INSERT INTO recording_segments
      (recording_id, segment_index, egress_id, object_key, status)
     VALUES ($1, $2, $3, $4, 'recording')`,
    [sessionId, segment, started.egressId, started.objectKey]
  );
  await pool.query('UPDATE recording_sessions SET egress_id = $2 WHERE id = $1', [sessionId, started.egressId]);
  await pool.query(
    `UPDATE recordings SET object_key = COALESCE(object_key, $2), retention_until = DATE_ADD(NOW(), INTERVAL 30 DAY)
     WHERE id = $1`,
    [sessionId, started.objectKey]
  );
  return started;
}

async function stopCurrentSegment(sessionId: string) {
  const segment = await currentRecordingSegment(sessionId);
  if (!segment) return null;
  const result = await stopRoomRecording(String(segment.egress_id));
  const file = result.fileResults[0];
  // livekit.EgressStatus.EGRESS_COMPLETE = 3. A stopped request can also
  // return ABORTED/FAILED, which must never be exposed as a completed file.
  if (result.status !== 3 || result.error || !file) {
    const reason = result.error || `Egress ended with status ${result.status}`;
    await pool.query(
      `UPDATE recording_segments
       SET status = 'failed', completed_at = NOW(), failure_reason = $2
       WHERE id = $1`,
      [segment.id, reason]
    );
    recordingFailures.inc();
    throw new Error(reason);
  }
  await pool.query(
    `UPDATE recording_segments
     SET status = 'completed', size_bytes = $2, completed_at = NOW(), failure_reason = NULL
     WHERE id = $1`,
    [segment.id, Number(file.size)]
  );
  return { ...segment, size_bytes: Number(file.size) };
}

function broadcastRecordingSession(io: Server, session: RecordingSession | null) {
  if (!session) return;
  io.to(session.roomId).emit('recording-session-updated', session);
}

function toMysqlDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid recording timestamp: ${value}`);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getRecorderServiceToken() {
  return process.env.RECORDER_SERVICE_TOKEN?.trim() || null;
}

function getRecordingStorageDir() {
  return path.join(process.cwd(), 'storage', 'recordings');
}

function toDownloadFileName(recordingId: string, kind: 'video' | 'audio', mimeType?: string | null) {
  const extension = mimeType?.includes('webm')
    ? 'webm'
    : mimeType?.includes('ogg')
      ? 'ogg'
      : mimeType?.includes('mp4')
        ? 'mp4'
        : 'bin';
  return `${recordingId}-${kind}.${extension}`;
}

function isRecorderServiceAuthorized(req: Request) {
  const expectedToken = getRecorderServiceToken();
  if (!expectedToken) return false;

  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
  const headerToken = typeof req.headers['x-recorder-service-token'] === 'string'
    ? req.headers['x-recorder-service-token'].trim()
    : '';

  return bearerToken === expectedToken || headerToken === expectedToken;
}

type OwnedRoomResult =
  | { error: { status: number; body: { error: string } }; room?: never }
  | { room: any; error?: never };

async function getOwnedRoom(req: Request, roomId: string): Promise<OwnedRoomResult> {
  const roomResult = await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
  if (roomResult.rows.length === 0) {
    return { error: { status: 404, body: { error: 'Room not found' } } };
  }

  const room = roomResult.rows[0];
  if (String(room.creator_id) !== String(req.userId)) {
    return {
      error: {
        status: 403,
        body: { error: 'Only the room creator can manage recording sessions' },
      },
    };
  }

  return { room };
}

async function persistSessionSnapshot(session: RecordingSession) {
  await pool.query(
    `INSERT INTO recording_sessions
      (id, room_id, creator_id, started_by_user_id, status, hidden_recorder_socket_id, recorder_service_instance_id, started_at, updated_at, completed_at, last_heartbeat_at, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       hidden_recorder_socket_id = VALUES(hidden_recorder_socket_id),
       recorder_service_instance_id = VALUES(recorder_service_instance_id),
       updated_at = VALUES(updated_at),
       completed_at = VALUES(completed_at),
       last_heartbeat_at = VALUES(last_heartbeat_at),
       failure_reason = VALUES(failure_reason)`,
    [
      session.id,
      session.roomId,
      Number(session.creatorId),
      Number(session.startedByUserId),
      session.status,
      session.hiddenRecorderSocketId || null,
      session.recorderServiceInstanceId || null,
      toMysqlDateTime(session.startedAt),
      toMysqlDateTime(session.updatedAt),
      toMysqlDateTime(session.completedAt),
      toMysqlDateTime(session.lastHeartbeatAt),
      session.failureReason || null,
    ]
  );
}

async function ensureRecordingArchiveRow(session: RecordingSession) {
  await pool.query(
    `INSERT INTO recordings
      (id, room_id, creator_id, started_by_user_id, status, started_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       updated_at = VALUES(updated_at),
       completed_at = CASE
         WHEN VALUES(status) IN ('completed', 'ready', 'failed') THEN VALUES(updated_at)
         ELSE completed_at
       END`,
    [
      session.id,
      session.roomId,
      Number(session.creatorId),
      Number(session.startedByUserId),
      session.status,
      toMysqlDateTime(session.startedAt),
    ]
  );
}

async function updateRecordingArtifact(
  sessionId: string,
  kind: 'video' | 'audio',
  buffer: Buffer,
  contentType: string
) {
  const storageDir = getRecordingStorageDir();
  await fs.mkdir(storageDir, { recursive: true });
  const extension = contentType.includes('webm')
    ? 'webm'
    : contentType.includes('ogg')
      ? 'ogg'
      : contentType.includes('mp4')
        ? 'mp4'
        : 'bin';
  const fileName = `${sessionId}-${kind}.${extension}`;
  const relativePath = path.join('storage', 'recordings', fileName);
  const absolutePath = path.join(storageDir, fileName);
  await fs.writeFile(absolutePath, buffer);

  const pathColumn = kind === 'video' ? 'video_path' : 'audio_path';
  const sizeColumn = kind === 'video' ? 'video_size_bytes' : 'audio_size_bytes';
  const mimeColumn = kind === 'video' ? 'mime_type_video' : 'mime_type_audio';

  await pool.query(
    `UPDATE recordings
     SET ${pathColumn} = $2,
         ${sizeColumn} = $3,
         ${mimeColumn} = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [sessionId, relativePath, buffer.byteLength, contentType]
  );
}

type OwnedRecordingResult =
  | { error: { status: number; body: { error: string } }; recording?: never }
  | { recording: any; error?: never };

async function getOwnedRecording(userId: string, recordingId: string): Promise<OwnedRecordingResult> {
  const result = await pool.query(
    `SELECT r.*
     FROM recordings r
     WHERE r.id = $1`,
    [recordingId]
  );

  if (result.rows.length === 0) {
    return { error: { status: 404, body: { error: 'Recording not found' } } };
  }

  const row = result.rows[0] as any;
  if (String(row.creator_id) !== String(userId)) {
    return { error: { status: 403, body: { error: 'You do not have access to this recording' } } };
  }

  return { recording: row };
}

export function createUserRecordingRoutes(
  io: Server,
  recordingSessionManager: RecordingSessionManager
) {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT
           r.*,
           rooms.title AS room_title
         FROM recordings r
         LEFT JOIN rooms ON rooms.id = r.room_id
         WHERE r.creator_id = $1
         ORDER BY r.started_at DESC`,
        [req.userId]
      );
      return res.json(result.rows);
    } catch (error) {
      console.error('List recordings error:', error);
      return res.status(500).json({ error: 'Failed to load recordings' });
    }
  });

  router.get('/rooms/:roomId/active', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const ownedRoom = await getOwnedRoom(req, roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }
      const session = recordingSessionManager.getActiveSessionForRoom(roomId);
      return res.json({ session });
    } catch (error) {
      console.error('Get active recording session error:', error);
      return res.status(500).json({ error: 'Failed to load active recording session' });
    }
  });

  router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      const ownedRoom = await getOwnedRoom(req, session.roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }

      return res.json(session);
    } catch (error) {
      console.error('Get recording session error:', error);
      return res.status(500).json({ error: 'Failed to load recording session' });
    }
  });

  router.get('/:recordingId/:kind(video|audio)', async (req: Request, res: Response) => {
    try {
      const { recordingId, kind } = req.params;
      const ownedRecording = await getOwnedRecording(String(req.userId), recordingId);
      if (ownedRecording.error) {
        return res.status(ownedRecording.error.status).json(ownedRecording.error.body);
      }

      const row = ownedRecording.recording;
      if (row.object_key && kind === 'video') {
        const url = await createRecordingDownloadUrl(String(row.object_key));
        return res.redirect(302, url);
      }
      const relativePath = kind === 'video' ? row.video_path : row.audio_path;
      const mimeType = kind === 'video' ? row.mime_type_video : row.mime_type_audio;
      if (!relativePath) {
        return res.status(404).json({ error: `${kind} artifact is not available` });
      }

      const absolutePath = path.join(process.cwd(), relativePath);
      const buffer = await fs.readFile(absolutePath);
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${toDownloadFileName(recordingId, kind as 'video' | 'audio', mimeType)}"`
      );
      return res.send(buffer);
    } catch (error) {
      console.error('Download recording artifact error:', error);
      return res.status(500).json({ error: 'Failed to download recording artifact' });
    }
  });

  router.delete('/:recordingId', async (req: Request, res: Response) => {
    try {
      const { recordingId } = req.params;
      const ownedRecording = await getOwnedRecording(String(req.userId), recordingId);
      if (ownedRecording.error) {
        return res.status(ownedRecording.error.status).json(ownedRecording.error.body);
      }

      const row = ownedRecording.recording;
      const segments = await pool.query<any>(
        'SELECT object_key FROM recording_segments WHERE recording_id = $1',
        [recordingId]
      );
      const filePaths = [row.video_path, row.audio_path]
        .filter(Boolean)
        .map((relativePath: string) => path.join(process.cwd(), relativePath));

      await pool.query('DELETE FROM recordings WHERE id = $1', [recordingId]);
      await pool.query('DELETE FROM recording_sessions WHERE id = $1', [recordingId]);
      await removeRecordingObjects(segments.rows.map((segment) => String(segment.object_key)));

      await Promise.all(
        filePaths.map((filePath) =>
          fs.unlink(filePath).catch((error: any) => {
            if (error?.code !== 'ENOENT') {
              throw error;
            }
          })
        )
      );

      return res.json({ message: 'Recording deleted successfully' });
    } catch (error) {
      console.error('Delete recording error:', error);
      return res.status(500).json({ error: 'Failed to delete recording' });
    }
  });

  router.post('/sessions/start', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.body || {};
      if (!roomId) {
        return res.status(400).json({ error: 'roomId is required' });
      }
      if (req.body?.consentConfirmed !== true) {
        return res.status(400).json({ error: 'Recording consent confirmation is required' });
      }

      const ownedRoom = await getOwnedRoom(req, roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }
      await assertStorageQuotaAvailable(String(ownedRoom.room.creator_id));

      const session = recordingSessionManager.createSession(
        roomId,
        String(ownedRoom.room.creator_id),
        String(req.userId)
      );
      await persistSessionSnapshot(session);
      await ensureRecordingArchiveRow(session);
      try {
        const egress = await startRecordingSegment(roomId, session.id);
        recordingSessionManager.claimSession(session.id, 'livekit-egress', egress.egressId);
        await persistSessionSnapshot(session);
      } catch (cause) {
        const failed = recordingSessionManager.failSession(
          session.id,
          cause instanceof Error ? cause.message : 'LiveKit Egress failed to start'
        );
        if (failed) await persistSessionSnapshot(failed);
        throw cause;
      }
      broadcastRecordingSession(io, session);
      await writeAuditLog({
        roomId,
        actorUserId: String(req.userId),
        action: 'recording.started',
        details: { consentConfirmed: true, recordingId: session.id },
      });
      return res.status(201).json(session);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        return res.status(507).json({
          error: 'Recording storage quota exceeded',
          code: 'RECORDING_STORAGE_FULL',
        });
      }
      console.error('Start recording session error:', error);
      return res.status(500).json({ error: 'Failed to start recording session' });
    }
  });

  router.post('/sessions/:sessionId/pause', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      const ownedRoom = await getOwnedRoom(req, session.roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }

      await stopCurrentSegment(req.params.sessionId);
      const updated = recordingSessionManager.pauseSession(req.params.sessionId);
      if (!updated) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(updated);
      broadcastRecordingSession(io, updated);
      return res.json(updated);
    } catch (error) {
      console.error('Pause recording session error:', error);
      return res.status(500).json({ error: 'Failed to pause recording session' });
    }
  });

  router.post('/sessions/:sessionId/resume', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      const ownedRoom = await getOwnedRoom(req, session.roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }
      await assertStorageQuotaAvailable(String(ownedRoom.room.creator_id));

      const egress = await startRecordingSegment(session.roomId, session.id);
      const updated = recordingSessionManager.resumeSession(req.params.sessionId);
      if (!updated) {
        return res.status(404).json({ error: 'Recording session not found' });
      }
      recordingSessionManager.claimSession(session.id, 'livekit-egress', egress.egressId);

      await persistSessionSnapshot(updated);
      broadcastRecordingSession(io, updated);
      return res.json(updated);
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        return res.status(507).json({
          error: 'Recording storage quota exceeded',
          code: 'RECORDING_STORAGE_FULL',
        });
      }
      console.error('Resume recording session error:', error);
      return res.status(500).json({ error: 'Failed to resume recording session' });
    }
  });

  router.post('/sessions/:sessionId/stop', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      const ownedRoom = await getOwnedRoom(req, session.roomId);
      if (ownedRoom.error) {
        return res.status(ownedRoom.error.status).json(ownedRoom.error.body);
      }

      await stopCurrentSegment(req.params.sessionId);
      const updated = recordingSessionManager.completeSession(req.params.sessionId);
      if (!updated) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(updated);
      await pool.query(
        `UPDATE recordings
         SET status = 'ready', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [updated.id]
      );
      broadcastRecordingSession(io, updated);
      return res.json(updated);
    } catch (error) {
      console.error('Stop recording session error:', error);
      return res.status(500).json({ error: 'Failed to stop recording session' });
    }
  });

  return router;
}

export function createRecorderServiceRoutes(
  io: Server,
  recordingSessionManager: RecordingSessionManager
) {
  const router = Router();

  router.use((req: Request, res: Response, next) => {
    if (!getRecorderServiceToken()) {
      return res.status(503).json({ error: 'Recorder service token is not configured' });
    }
    if (!isRecorderServiceAuthorized(req)) {
      return res.status(401).json({ error: 'Recorder service authorization failed' });
    }
    next();
  });

  router.get('/sessions/claimable', async (_req: Request, res: Response) => {
    try {
      const sessions = recordingSessionManager
        .listSessions()
        .filter(
          (session) =>
            !['completed', 'failed'].includes(session.status) &&
            !session.hiddenRecorderSocketId
        );
      return res.json({ sessions });
    } catch (error) {
      console.error('List claimable recording sessions error:', error);
      return res.status(500).json({ error: 'Failed to list claimable recording sessions' });
    }
  });

  router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }
      return res.json(session);
    } catch (error) {
      console.error('Get recorder service session error:', error);
      return res.status(500).json({ error: 'Failed to load recording session' });
    }
  });

  router.post('/sessions/:sessionId/claim', async (req: Request, res: Response) => {
    try {
      const { serviceInstanceId, recorderSocketId } = req.body || {};
      if (!serviceInstanceId || !recorderSocketId) {
        return res.status(400).json({ error: 'serviceInstanceId and recorderSocketId are required' });
      }

      const session = recordingSessionManager.claimSession(
        req.params.sessionId,
        String(serviceInstanceId),
        String(recorderSocketId)
      );
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(session);
      await ensureRecordingArchiveRow(session);
      broadcastRecordingSession(io, session);
      return res.json(session);
    } catch (error) {
      console.error('Claim recording session error:', error);
      return res.status(500).json({ error: 'Failed to claim recording session' });
    }
  });

  router.post('/sessions/:sessionId/heartbeat', async (req: Request, res: Response) => {
    try {
      const { serviceInstanceId } = req.body || {};
      if (!serviceInstanceId) {
        return res.status(400).json({ error: 'serviceInstanceId is required' });
      }

      const session = recordingSessionManager.heartbeat(
        req.params.sessionId,
        String(serviceInstanceId)
      );
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(session);
      return res.json(session);
    } catch (error) {
      console.error('Recording heartbeat error:', error);
      return res.status(500).json({ error: 'Failed to update recording heartbeat' });
    }
  });

  router.post('/sessions/:sessionId/complete', async (req: Request, res: Response) => {
    try {
      const session = recordingSessionManager.completeSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(session);
      await ensureRecordingArchiveRow(session);
      await pool.query(
        'UPDATE recordings SET status = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1',
        [session.id, 'ready']
      );
      broadcastRecordingSession(io, session);
      return res.json(session);
    } catch (error) {
      console.error('Complete recording session error:', error);
      return res.status(500).json({ error: 'Failed to complete recording session' });
    }
  });

  router.post('/sessions/:sessionId/fail', async (req: Request, res: Response) => {
    try {
      const { reason } = req.body || {};
      const session = recordingSessionManager.failSession(
        req.params.sessionId,
        String(reason || 'Recorder service reported failure')
      );
      if (!session) {
        return res.status(404).json({ error: 'Recording session not found' });
      }

      await persistSessionSnapshot(session);
      await ensureRecordingArchiveRow(session);
      await pool.query(
        'UPDATE recordings SET status = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1',
        [session.id, 'failed']
      );
      broadcastRecordingSession(io, session);
      return res.json(session);
    } catch (error) {
      console.error('Fail recording session error:', error);
      return res.status(500).json({ error: 'Failed to fail recording session' });
    }
  });

  router.put(
    '/sessions/:sessionId/artifacts/:kind',
    express.raw({ type: '*/*', limit: '2gb' }),
    async (req: Request, res: Response) => {
      try {
        const kind = req.params.kind === 'audio' ? 'audio' : req.params.kind === 'video' ? 'video' : null;
        if (!kind) {
          return res.status(400).json({ error: 'Artifact kind must be video or audio' });
        }

        const session = recordingSessionManager.getSession(req.params.sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Recording session not found' });
        }

        const contentType = req.headers['content-type'] || 'application/octet-stream';
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
        await ensureRecordingArchiveRow(session);
        await updateRecordingArtifact(session.id, kind, body, String(contentType));
        return res.json({ ok: true });
      } catch (error) {
        console.error('Upload recording artifact error:', error);
        return res.status(500).json({ error: 'Failed to store recording artifact' });
      }
    }
  );

  return router;
}
