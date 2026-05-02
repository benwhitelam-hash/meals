import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import { getActiveList, createList, addItem } from '@/lib/shopping';
import { categorizeItems } from '@/lib/extract';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

/**
 * POST /api/shopping/items
 * Body: { content: string }
 * Adds a single item to the current active list (creates one if none exists).
 * Categorises via Haiku before inserting.
 */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  try {
    let list = await getActiveList();
    if (!list) {
      list = await createList(user);
    }

    // Skip if already on the list (case-insensitive)
    const existing = list.items.find(
      (i) => i.content.toLowerCase().trim() === content.toLowerCase()
    );
    if (existing) {
      return NextResponse.json({ item: existing, duplicate: true });
    }

    // Categorise the single item
    const categories = await categorizeItems([content]);
    const item = await addItem({
      list_id: list.id,
      content,
      category: categories[content] ?? 'other',
      source: 'manual',
      added_by: user,
    });

    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
