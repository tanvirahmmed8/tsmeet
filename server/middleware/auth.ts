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
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, jwtSecret, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.userId = user.userId;
    req.user = user;
    next();
  });
};
