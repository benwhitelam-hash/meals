import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { getActiveList } from '@/lib/shopping';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/** GET the currently-active shopping list (or null if none). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  try {
    const list = await getActiveList();
    return NextResponse.json({ list });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
