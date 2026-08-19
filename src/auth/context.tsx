/**
 * The app's one piece of auth state: are we `loading`, `signedOut`, or
 * `signedIn`, and who is signed in. Everything durable lives in secure store
 * (see `@/auth/client`); this is just the mounted view of it.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  fetchCurrentUser,
  getStoredSessionAsync,
  getValidAccessTokenAsync,
  signInAsync,
  signOutAsync,
  SignedOutError,
  type RavelryUser,
} from '@/auth/client';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  // `user` may be null while signed in: the session restored but the profile
  // fetch failed for a reason that is not "signed out" (offline, Ravelry 5xx).
  | { status: 'signedIn'; user: RavelryUser | null };

export type AuthValue = AuthState & {
  /** Runs the browser round trip. Rejects if it does not complete. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const SIGNED_OUT = { status: 'signedOut', user: null } as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  // Cold start: restore the session, then put a name and face to it. A stored
  // session that Ravelry still honours goes straight to `signedIn` with no
  // browser round trip; the refresh (if the token aged out) happens inside
  // getValidAccessTokenAsync.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const session = await getStoredSessionAsync();
        if (!session) {
          if (!cancelled) {
            setState(SIGNED_OUT);
          }
          return;
        }

        const token = await getValidAccessTokenAsync();
        const user = await fetchCurrentUser(token);
        if (!cancelled) {
          setState({ status: 'signedIn', user });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof SignedOutError) {
          // The client has already cleared the session.
          setState(SIGNED_OUT);
          return;
        }
        // Offline or Ravelry is having a day: the session is still valid, so
        // stay signed in and show what we can.
        const session = await getStoredSessionAsync().catch(() => null);
        if (!cancelled) {
          setState(session ? { status: 'signedIn', user: null } : SIGNED_OUT);
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    const session = await signInAsync();

    let user: RavelryUser | null = null;
    try {
      user = await fetchCurrentUser(session.accessToken);
    } catch (error) {
      if (error instanceof SignedOutError) {
        setState(SIGNED_OUT);
        throw error;
      }
      // A fresh session with an unloaded profile is still signed in.
    }

    setState({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutAsync();
    } finally {
      setState(SIGNED_OUT);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}
