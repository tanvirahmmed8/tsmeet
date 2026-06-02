import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';

const router = Router();

// Create a new meeting room
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    const roomId = uuidv4();
    const userId = req.userId;

    const result = await pool.query(
      'INSERT INTO rooms (id, title, description, creator_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomId, title || 'Untitled Meeting', description || '', userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Get room details
router.get('/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

// Get user's rooms
router.get('/user/rooms', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const result = await pool.query('SELECT * FROM rooms WHERE creator_id = $1 ORDER BY created_at DESC', [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get user rooms error:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// End a meeting room
router.post('/:roomId/end', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    // Check if user is the creator
    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = result.rows[0];
    if (room.creator_id !== userId) {
      return res.status(403).json({ error: 'Only room creator can end the meeting' });
    }

    // Update room status to ended
    await pool.query('UPDATE rooms SET ended_at = NOW() WHERE id = $1', [roomId]);

    res.json({ message: 'Room ended successfully' });
  } catch (error) {
    console.error('End room error:', error);
    res.status(500).json({ error: 'Failed to end room' });
  }
});

export default router;
