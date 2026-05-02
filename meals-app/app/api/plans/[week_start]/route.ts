import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import {
  getPlan,
  setPlan,
  setEntry,
  clearEntry,
  setActivity,
  clearActivity,
  ALL_DAYS,
  type DayCode,
  type EntryKind,
  type PlanEntry,
} from '@/lib/plans';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

function validWeek(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ week_start: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { week_start } = await params;
  if (!validWeek(week_start)) {
    return NextResponse.json({ error: 'invalid week format' }, { status: 400 });
  }
  try {
    const plan = await getPlan(week_start);
    return NextResponse.json({ plan, week_start });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

/** PUT replaces the entire week's entries. Body: { entries: PlanEntry[] } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ week_start: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { week_start } = await params;
  if (!validWeek(week_start)) {
    return NextResponse.json({ error: 'invalid week format' }, { status: 400 });
  }

  let body: { entries?: PlanEntry[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'entries[] required' }, { status: 400 });
  }

  try {
    const plan = await setPlan(week_start, body.entries, user);
    return NextResponse.json({ plan });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

/**
 * PATCH updates a single day. Body:
 * { day: 'mon',
 *   action: 'set' | 'clear' | 'set_activity' | 'clear_activity',
 *   kind?: 'recipe'|'freetext', recipe_id?, text?, notes? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ week_start: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { week_start } = await params;
  if (!validWeek(week_start)) {
    return NextResponse.json({ error: 'invalid week format' }, { status: 400 });
  }

  let body: {
    day?: DayCode;
    action?: 'set' | 'clear' | 'set_activity' | 'clear_activity';
    kind?: EntryKind;
    recipe_id?: string;
    text?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.day || !ALL_DAYS.includes(body.day)) {
    return NextResponse.json({ error: 'valid day required' }, { status: 400 });
  }

  try {
    if (body.action === 'clear') {
      const plan = await clearEntry(week_start, body.day, user);
      return NextResponse.json({ plan });
    }
    if (body.action === 'set') {
      if (!body.kind) {
        return NextResponse.json({ error: 'kind required' }, { status: 400 });
      }
      if (body.kind === 'recipe' && !body.recipe_id) {
        return NextResponse.json({ error: 'recipe_id required' }, { status: 400 });
      }
      if (body.kind === 'freetext' && !body.text?.trim()) {
        return NextResponse.json({ error: 'text required' }, { status: 400 });
      }
      const plan = await setEntry(
        week_start,
        body.day,
        {
          kind: body.kind,
          ...(body.recipe_id ? { recipe_id: body.recipe_id } : {}),
          ...(body.text ? { text: body.text.trim() } : {}),
          ...(body.notes ? { notes: body.notes.trim() } : {}),
        },
        user
      );
      return NextResponse.json({ plan });
    }
    if (body.action === 'set_activity') {
      if (!body.text?.trim()) {
        return NextResponse.json({ error: 'text required' }, { status: 400 });
      }
      const plan = await setActivity(
        week_start,
        body.day,
        {
          text: body.text.trim(),
          ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
        },
        user
      );
      return NextResponse.json({ plan });
    }
    if (body.action === 'clear_activity') {
      const plan = await clearActivity(week_start, body.day, user);
      if (!plan) return NextResponse.json({ error: 'plan not found' }, { status: 404 });
      return NextResponse.json({ plan });
    }
    return NextResponse.json(
      { error: 'action must be set, clear, set_activity, or clear_activity' },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
