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

export const SESSION_CHANGED_EVENT = 'tsmeet-session-changed';

// A room-scoped guest cookie is not an authenticated workspace account.
export async function getAccountSessionUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.guest === false ? user : null;
}

export async function signOutSession(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to sign out. Please retry.');
}

export function cacheSessionUser(user: unknown | null): void {
  // Optional convenience cache. Safari/private-mode storage failure must never
  // turn a successful cookie login/logout into an application error.
  try {
    localStorage.removeItem('token');
    if (user === null) localStorage.removeItem('user');
    else localStorage.setItem('user', JSON.stringify(user));
  } catch { /* Cookie authentication does not depend on localStorage. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}
