/**
 * Ravelry sign-in, tokens, and the one stored session.
 *
 * Ravelry's OAuth 2 app credentials cannot ship in a client, so the flow goes
 * through a small broker (`soft-goods-auth`): the app opens the broker's
 * `/api/login`, Ravelry redirects back to the broker, and the broker bounces to
 * this app's `softgoods://auth` deep link with the authorization code. The
 * broker exchanges/refreshes with the client secret; the app never holds it.
 *
 * Known limitation: in Expo Go the `softgoods://` redirect cannot return to the
 * app (Expo Go owns the `exp://` scheme), so the round trip only completes in a
 * dev build or a release build. Nothing here is special-cased for Expo Go.
 *
 * Nothing in this module logs tokens.
 */

import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

const BROKER_URL = 'https://soft-goods-auth.vercel.app';
const RAVELRY_API_URL = 'https://api.ravelry.com';

/** Must match the redirect the broker bounces to, and app.json's `scheme`. */
const RETURN_URL = 'softgoods://auth';

/** One key holds the whole session; there is no second source of truth. */
const SESSION_KEY = 'softgoods.ravelry.session';

/** Treat a token as expired this long before it actually is. */
const EXPIRY_MARGIN_MS = 60_000;

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms, already backed off by `EXPIRY_MARGIN_MS`. */
  expiresAt: number;
};

export type RavelryUser = {
  id: number;
  username: string;
  photo_url?: string | null;
  [key: string]: unknown;
};

/**
 * The stored session is gone or no longer accepted by Ravelry. Callers should
 * show signed-out UI; the session has already been cleared when this is thrown.
 */
export class SignedOutError extends Error {
  constructor(message = 'Signed out of Ravelry.') {
    super(message);
    this.name = 'SignedOutError';
  }
}

/** The sign-in round trip did not finish: cancelled, mismatched, or refused. */
export class SignInError extends Error {
  constructor(message = 'Sign-in did not complete.') {
    super(message);
    this.name = 'SignInError';
  }
}

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

/** Query params arrive as `string | string[] | undefined`; take the first. */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function toSession(payload: unknown): Session {
  const body = (payload ?? {}) as TokenResponse;
  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  const expiresIn = body.expires_in;

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new Error('Ravelry returned an unreadable token response.');
  }

  // Ravelry sends ~86400s. If it ever omits it, assume the token is already due
  // for a refresh rather than trusting it forever.
  const lifetimeMs = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn * 1000 : 0;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + lifetimeMs - EXPIRY_MARGIN_MS,
  };
}

async function writeSessionAsync(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    // Lets a background refresh read the session after a reboot on iOS.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

/** The stored session, or `null` if there is none (or it is unreadable). */
export async function getStoredSessionAsync(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return { ...parsed } as Session;
    }
  } catch {
    // Fall through: a corrupt record is the same as no record.
  }

  await clearSessionAsync();
  return null;
}

async function clearSessionAsync(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function postJsonAsync(path: string, body: Record<string, string>): Promise<Response> {
  return fetch(`${BROKER_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Opens Ravelry's authorization page and, on return, exchanges the code for a
 * session that is persisted before this resolves.
 *
 * Throws `SignInError` if the user backs out, if the returned `state` does not
 * match the one we generated, or if Ravelry hands back an error.
 */
export async function signInAsync(): Promise<Session> {
  const state = Crypto.randomUUID();
  const authUrl = `${BROKER_URL}/api/login?state=${encodeURIComponent(state)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, RETURN_URL);

  if (result.type !== 'success') {
    // 'cancel' | 'dismiss' | 'opened' | 'locked' — the user never got back here.
    throw new SignInError('Sign-in was closed before it finished.');
  }

  const { queryParams } = Linking.parse(result.url);
  const params = queryParams ?? {};
  const error = firstParam(params.error);
  const returnedState = firstParam(params.state);
  const code = firstParam(params.code);

  if (error) {
    throw new SignInError('Ravelry refused the sign-in.');
  }

  // Constant-length compare is pointless here: the state is a fresh v4 UUID
  // held only in this closure. It just has to match exactly.
  if (!returnedState || returnedState !== state) {
    throw new SignInError('Sign-in could not be verified.');
  }

  if (!code) {
    throw new SignInError('Ravelry returned no authorization code.');
  }

  const response = await postJsonAsync('/api/token', { code });
  if (!response.ok) {
    throw new SignInError(`Ravelry rejected the authorization code (${response.status}).`);
  }

  const session = toSession(await response.json());
  await writeSessionAsync(session);
  return session;
}

/**
 * Deduped refresh: concurrent callers share one round trip so Ravelry never
 * sees two refreshes for the same (single-use) refresh token.
 */
let refreshInFlight: Promise<Session> | null = null;

async function performRefreshAsync(refreshToken: string): Promise<Session> {
  const response = await postJsonAsync('/api/refresh', { refresh_token: refreshToken });

  if (response.status === 400 || response.status === 401) {
    // Revoked, rotated out from under us, or expired: this session is done.
    await clearSessionAsync();
    throw new SignedOutError('Ravelry no longer accepts this session.');
  }

  if (!response.ok) {
    // Transient (5xx, rate limit): keep the session, let the caller retry.
    throw new Error(`Could not refresh the Ravelry session (${response.status}).`);
  }

  // Ravelry may rotate the refresh token, so always store what came back.
  const session = toSession(await response.json());
  await writeSessionAsync(session);
  return session;
}

async function refreshSessionAsync(refreshToken: string): Promise<Session> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const inFlight: Promise<Session> = performRefreshAsync(refreshToken);
  refreshInFlight = inFlight;

  try {
    return await inFlight;
  } finally {
    if (refreshInFlight === inFlight) {
      refreshInFlight = null;
    }
  }
}

/**
 * An access token that is good right now, refreshing first if the stored one is
 * within the safety margin of expiring.
 *
 * Throws `SignedOutError` when there is no session, or when Ravelry rejects the
 * refresh (in which case the stored session has been cleared).
 */
export async function getValidAccessTokenAsync(): Promise<string> {
  const session = await getStoredSessionAsync();
  if (!session) {
    throw new SignedOutError('No stored Ravelry session.');
  }

  if (Date.now() < session.expiresAt) {
    return session.accessToken;
  }

  const refreshed = await refreshSessionAsync(session.refreshToken);
  return refreshed.accessToken;
}

/** Forgets the session. Ravelry has no token-revocation endpoint to call. */
export async function signOutAsync(): Promise<void> {
  refreshInFlight = null;
  await clearSessionAsync();
}

/**
 * The signed-in Ravelry user. Throws `SignedOutError` on 401 (session cleared).
 */
export async function fetchCurrentUser(accessToken: string): Promise<RavelryUser> {
  const response = await fetch(`${RAVELRY_API_URL}/current_user.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    await clearSessionAsync();
    throw new SignedOutError('Ravelry rejected the access token.');
  }

  if (!response.ok) {
    throw new Error(`Could not load the Ravelry account (${response.status}).`);
  }

  const body = (await response.json()) as { user?: RavelryUser };
  if (!body?.user) {
    throw new Error('Ravelry returned no account.');
  }

  return body.user;
}
