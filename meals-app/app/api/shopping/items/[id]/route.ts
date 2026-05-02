import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { setItemChecked, deleteItem } from '@/lib/shopping';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/** PATCH /api/shopping/items/[id] — body: { checked: boolean } */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;

  let body: { checked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'checked (boolean) required' }, { status: 400 });
  }

  try {
    const item = await setItemChecked(id, body.checked);
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const { id } = await params;

  try {
    const ok = await deleteItem(id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
