import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const router = Router();
const registerSchema = z.object({
  email: z.string().trim().email().max(191).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(191),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(191).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const guestSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});
const getJwtSecret = () => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }
  return jwtSecret;
};

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid registration data' });
    const { email, password, name } = parsed.data;

    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, hashedPassword, name]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password' });
    const { email, password } = parsed.data;

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Create a short-lived, room-scoped identity for anonymous waiting-room users.
// A real users row is used so existing meeting foreign keys and audit rules remain valid.
router.post('/guest', async (req: Request, res: Response) => {
  try {
    const parsed = guestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'A valid room and display name are required' });
    }

    const { roomId, name } = parsed.data;
    const room = await pool.query('SELECT id, ended_at FROM rooms WHERE id = $1', [roomId]);
    if (room.rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    if (room.rows[0].ended_at) return res.status(410).json({ error: 'Meeting has ended' });

    const nonce = randomUUID();
    const email = `guest-${nonce}@guest.tsmeet.invalid`;
    const passwordHash = await bcrypt.hash(randomUUID(), 4);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, name',
      [email, passwordHash, name]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, name: user.name, guest: true, roomId },
      getJwtSecret(),
      { expiresIn: '12h' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, guest: true },
    });
  } catch (error) {
    console.error('Guest session error:', error);
    return res.status(500).json({ error: 'Failed to create guest session' });
  }
});

// Verify token
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
});

export default router;
