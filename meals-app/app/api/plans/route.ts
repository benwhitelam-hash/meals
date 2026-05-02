import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { getPlan, mondayOf } from '@/lib/plans';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/**
 * GET /api/plans
 * GET /api/plans?week=2026-05-04
 *
 * Returns the plan for the requested week (defaults to this week).
 * If no plan exists, returns { plan: null, week_start }.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const url = new URL(request.url);
  const week = url.searchParams.get('week') || mondayOf();

  // Validate format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'invalid week format' }, { status: 400 });
  }

  try {
    const plan = await getPlan(week);
    return NextResponse.json({ plan, week_start: week });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
