/**
 * Shared auth helpers for pinkcrocodile.dev apps.
 *
 * Designed to be lifted into a shared npm package once we have a second app.
 * For now, copy this file into each project.
 *
 * Env vars required:
 *   AUTH_USERS_JSON  - JSON array: [{"username":"ben","password":"..."},{"username":"jenny","password":"..."}]
 *   AUTH_SECRET      - long random string, used to sign session JWTs
 *
 * Cookie is scoped to .pinkcrocodile.dev so logging in on one subdomain
 * authenticates the user across all of them (SSO across the whole estate).
 */

import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE_NAME = 'pc_session';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface AuthUser {
  username: string;
  password: string;
}

export interface SessionPayload {
  username: string;
}

function getUsers(): AuthUser[] {
  const json = process.env.AUTH_USERS_JSON;
  if (!json) throw new Error('AUTH_USERS_JSON env var not set');
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error('AUTH_USERS_JSON must be an array');
    return parsed;
  } catch (e) {
    throw new Error('AUTH_USERS_JSON is not valid JSON');
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET env var not set');
  if (secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 chars');
  return new TextEncoder().encode(secret);
}

/**
 * Constant-time string comparison to avoid timing attacks on password check.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function validateCredentials(
  username: string,
  password: string
): Promise<string | null> {
  const users = getUsers();
  const normalised = username.trim().toLowerCase();
  const user = users.find((u) => u.username.toLowerCase() === normalised);
  if (!user) {
    // Still do a comparison to roughly equalise timing
    timingSafeEqual(password, 'x'.repeat(password.length));
    return null;
  }
  if (!timingSafeEqual(password, user.password)) return null;
  return user.username; // return canonical username from store
}

export async function createSession(username: string): Promise<string> {
  return await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.username !== 'string') return null;
    return { username: payload.username };
  } catch {
    return null;
  }
}

const isProd = process.env.NODE_ENV === 'production';

/**
 * Cookie options used for the session cookie.
 *
 * Set COOKIE_DOMAIN=".pinkcrocodile.dev" in production so logging in on one
 * subdomain authenticates the user across all of them.
 *
 * If COOKIE_DOMAIN is unset (preview deployments, local dev), the cookie
 * defaults to the request host — auth still works, just no cross-subdomain SSO.
 */
export const COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  maxAge: AUTH_COOKIE_MAX_AGE,
};
