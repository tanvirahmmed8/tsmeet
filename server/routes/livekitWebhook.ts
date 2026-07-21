import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { pool } from '../db';
import { recordingFailures } from '../services/metrics';

function requiredSecret(name: 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function roomIdFromLiveKitName(name?: string) {
  const match = name?.match(/^tsmeet-([0-9a-f]{8}-[0-9a-f-]{27})$/i);
  return match?.[1]?.toLowerCase() || null;
}

export async function receiveLiveKitWebhook(req: Request, res: Response) {
  try {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: 'Expected a raw webhook body' });
    }

    const receiver = new WebhookReceiver(
      requiredSecret('LIVEKIT_API_KEY'),
      requiredSecret('LIVEKIT_API_SECRET')
    );
    const event = await receiver.receive(
      req.body.toString('utf8'),
      req.header('authorization') || undefined
    );
    const roomId = roomIdFromLiveKitName(event.room?.name);
    const identity = event.participant?.identity || null;

    await pool.query(
      `INSERT IGNORE INTO livekit_webhook_events
        (event_id, room_id, event_type, participant_identity)
       VALUES ($1, $2, $3, $4)`,
      [event.id || randomUUID(), roomId, event.event, identity]
    );

    const egress = event.egressInfo;
    if (egress?.egressId && ['egress_updated', 'egress_ended'].includes(event.event)) {
      const file = egress.fileResults[0];
      const failed = Boolean(egress.error);
      await pool.query(
        `UPDATE recording_segments
         SET status = $2,
             size_bytes = COALESCE($3, size_bytes),
             completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
             failure_reason = $4
         WHERE egress_id = $1`,
        [
          egress.egressId,
          failed ? 'failed' : event.event === 'egress_ended' ? 'completed' : 'recording',
          file ? Number(file.size) : null,
          failed ? egress.error : null,
        ]
      );
      if (failed) {
        recordingFailures.inc();
        await pool.query(
          `UPDATE recording_sessions SET status = 'failed', failure_reason = $2, updated_at = NOW()
           WHERE egress_id = $1`,
          [egress.egressId, egress.error]
        );
        await pool.query(
          `UPDATE recordings INNER JOIN recording_sessions ON recording_sessions.id = recordings.id
           SET recordings.status = 'failed', recordings.updated_at = NOW()
           WHERE recording_sessions.egress_id = $1`,
          [egress.egressId]
        );
      }
    }

    if (roomId && event.event === 'room_started') {
      await pool.query(
        'UPDATE rooms SET livekit_started_at = COALESCE(livekit_started_at, NOW()) WHERE id = $1',
        [roomId]
      );
    } else if (roomId && event.event === 'room_finished') {
      await pool.query(
        'UPDATE rooms SET livekit_finished_at = NOW(), ended_at = COALESCE(ended_at, NOW()) WHERE id = $1',
        [roomId]
      );
    } else if (roomId && identity?.startsWith('user:')) {
      const userId = identity.slice(5);
      if (/^\d+$/.test(userId) && event.event === 'participant_joined') {
        await pool.query(
          'INSERT INTO room_participants (room_id, user_id, joined_at) VALUES ($1, $2, NOW())',
          [roomId, userId]
        );
      } else if (/^\d+$/.test(userId) && event.event === 'participant_left') {
        await pool.query(
          `UPDATE room_participants SET left_at = NOW()
           WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
          [roomId, userId]
        );
      }
    }

    return res.status(204).send();
  } catch (error) {
    console.warn('Rejected LiveKit webhook:', error);
    return res.status(401).json({ error: 'Invalid webhook' });
  }
}
