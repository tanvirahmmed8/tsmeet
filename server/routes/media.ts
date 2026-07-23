import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { createParticipantToken } from '../services/livekit';
import { mediaProviderForRoom } from '../services/mediaProvider';

const router = Router();

router.post('/token', async (req: Request, res: Response) => {
  try {
    const userId = String(req.userId || '');
    const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId.trim() : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';

    if (!userId || !roomId || !displayName || displayName.length > 100) {
      return res.status(400).json({ error: 'A valid roomId and displayName are required' });
    }
    if (req.user?.guest && req.user?.roomId !== roomId) {
      return res.status(403).json({ error: 'This guest session belongs to a different meeting' });
    }

    const provider = mediaProviderForRoom(roomId);
    if (provider !== 'livekit') {
      return res.status(409).json({
        error: 'This room is assigned to the legacy mesh media provider',
        code: 'MEDIA_PROVIDER_MESH',
        provider,
      });
    }

    const result = await pool.query<any>(
      `SELECT rooms.creator_id, rooms.ended_at, meeting_roles.role,
              meeting_waiting_participants.status AS waiting_status
       FROM rooms
       LEFT JOIN meeting_roles
         ON meeting_roles.room_id = rooms.id AND meeting_roles.user_id = $2
       LEFT JOIN meeting_waiting_participants
         ON meeting_waiting_participants.room_id = rooms.id
        AND meeting_waiting_participants.user_id = $2
       WHERE rooms.id = $1`,
      [roomId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    if (result.rows[0].ended_at) return res.status(410).json({ error: 'Meeting has ended' });

    const isCreator = String(result.rows[0].creator_id) === userId;
    const approved = result.rows[0].waiting_status === 'approved';
    if (!isCreator && !approved) {
      return res.status(403).json({ error: 'Waiting-room approval is required' });
    }

    // Privileges are derived only from trusted server data. Any client-supplied
    // role or grant fields are deliberately ignored.
    const role = isCreator
      ? 'host'
      : result.rows[0].role === 'co-host'
        ? 'co-host'
        : 'guest';
    const credentials = await createParticipantToken({ roomId, userId, displayName, role });
    return res.json({ ...credentials, provider });
  } catch (error) {
    console.error('LiveKit token error:', error);
    return res.status(500).json({ error: 'Failed to create media token' });
  }
});

export default router;
