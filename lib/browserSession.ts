export interface SessionUser {
  id: string;
  name: string;
  email?: string;
  guest: boolean;
  roomId?: string;
}

// localStorage is a convenience cache, never proof that a cookie session exists.
export async function getSessionUser(): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Unable to verify your session. Please retry.');
  return (await response.json()).user;
}
