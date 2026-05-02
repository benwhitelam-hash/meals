import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { completeList } from '@/lib/shopping';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/**
 * PATCH /api/shopping/[id]
 * Body: { action: 'complete' }
 * Marks the list as done.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.action !== 'complete') {
    return NextResponse.json({ error: 'action must be complete' }, { status: 400 });
  }

  try {
    const ok = await completeList(id);
    if (!ok) {
      return NextResponse.json({ error: 'list not found or already completed' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
