'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheSessionUser, getAccountSessionUser, SESSION_CHANGED_EVENT, signOutSession, type SessionUser } from '@/lib/browserSession';

type AccountState = {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  user: SessionUser | null;
  error: string | null;
};

export function useAccountSession() {
  const [state, setState] = useState<AccountState>({ status: 'loading', user: null, error: null });
  const [signingOut, setSigningOut] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const logoutBusy = useRef(false);

  const refresh = useCallback(async () => {
    if (!active.current || logoutBusy.current) return;
    const request = ++generation.current;
    // Keep a known view while revalidating on focus; do not unmount a form
    // and steal keyboard focus just because the user returned to this tab.
    setState((current) => ({ ...current, status: current.status === 'error' ? 'loading' : current.status, error: null }));
    try {
      const user = await getAccountSessionUser();
      if (active.current && request === generation.current) {
        setState({ status: user ? 'authenticated' : 'anonymous', user, error: null });
      }
    } catch {
      if (active.current && request === generation.current) {
        setState((current) => ({ ...current, status: 'error', error: 'Unable to verify your session. Please retry.' }));
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const recheck = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') recheck(); };
    const storage = (event: StorageEvent) => { if (!event.key || ['user', 'token'].includes(event.key)) recheck(); };
    recheck();
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    window.addEventListener('storage', storage);
    window.addEventListener(SESSION_CHANGED_EVENT, recheck);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active.current = false;
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      window.removeEventListener('storage', storage);
      window.removeEventListener(SESSION_CHANGED_EVENT, recheck);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (logoutBusy.current) return;
    logoutBusy.current = true;
    generation.current++; // A stale session request cannot restore the old account.
    setSigningOut(true);
    try {
      await signOutSession();
      if (active.current) setState({ status: 'anonymous', user: null, error: null });
      cacheSessionUser(null);
    } catch {
      if (active.current) setState((current) => ({ ...current, error: 'Unable to sign out. Please retry.' }));
    } finally {
      logoutBusy.current = false;
      if (active.current) setSigningOut(false);
    }
  }, []);

  return { ...state, refresh, signOut, signingOut };
}
