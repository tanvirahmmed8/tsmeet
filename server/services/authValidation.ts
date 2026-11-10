import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email().max(191).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(191),
});
export const loginSchema = z.object({
  email: z.string().trim().email().max(191).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const guestSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});
