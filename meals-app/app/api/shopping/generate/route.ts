import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { generateFromPlan } from '@/lib/shopping';
import { categorizeItems } from '@/lib/extract';
import { mondayOf } from '@/lib/plans';

export const runtime = 'nodejs';
export const maxDuration = 60; // generation can take a moment with Haiku categorisation

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/**
 * POST /api/shopping/generate
 * Body: { week_start?: string }
 *
 * Pulls ingredients from saved recipes in the given week's plan.
 * Defaults to current week if no week_start provided.
 * APPENDS to current open list (preserves manual items).
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  let body: { week_start?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const week = body.week_start || mondayOf();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: 'invalid week_start format' }, { status: 400 });
  }

  try {
    const result = await generateFromPlan(week, user, categorizeItems);
    if (!result) {
      return NextResponse.json(
        { error: 'no plan or no recipes in plan for that week' },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
