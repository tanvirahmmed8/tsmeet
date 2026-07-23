import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: any;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'Server misconfiguration: JWT secret is missing' });
  }

  const authHeader = req.headers['authorization'];
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('tsmeet_session='))
    ?.slice('tsmeet_session='.length);
  const token = cookieToken || (authHeader && authHeader.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, jwtSecret, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    if (user?.guest) {
      const guestRoomId = typeof user.roomId === 'string' ? user.roomId : '';
      const allowedRoomRead =
        req.baseUrl === '/api/rooms' &&
        req.method === 'GET' &&
        req.path === `/${guestRoomId}`;
      const allowedMediaRequest = req.baseUrl === '/api/media';
      if (!allowedRoomRead && !allowedMediaRequest) {
        return res.status(403).json({ error: 'Guest access is limited to this meeting' });
      }
    }
    req.userId = user.userId;
    req.user = user;
    next();
  });
};
