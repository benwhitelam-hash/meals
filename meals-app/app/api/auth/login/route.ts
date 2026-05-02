import { NextResponse } from 'next/server';
import { validateCredentials, createSession, COOKIE_OPTIONS } from '@/lib/auth';

export const runtime = 'nodejs';

// Per-instance rate limit. Good enough for personal app; if we ever need
// distributed rate limiting we'll move to Vercel KV or Upstash.
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 10;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a few minutes.' },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
  }

  const canonicalUsername = await validateCredentials(username, password);
  if (!canonicalUsername) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }

  const token = await createSession(canonicalUsername);
  const res = NextResponse.json({ ok: true, username: canonicalUsername });
  res.cookies.set({ ...COOKIE_OPTIONS, value: token });
  return res;
}
