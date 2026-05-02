import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  AUTH_COOKIE_NAME,
  verifySession,
} from '@/lib/auth';
import {
  listMemories,
  createMemory,
  type MemoryKind,
} from '@/lib/memory';

export const runtime = 'nodejs';

async function getUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  return session?.username ?? null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try {
    const memories = await listMemories();
    return NextResponse.json({ memories });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  let body: { kind?: MemoryKind; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { kind, content } = body;
  if (!kind || !['love', 'avoid', 'context'].includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  try {
    const memory = await createMemory({
      created_by: user,
      kind,
      content: content.trim(),
      source: 'explicit',
    });
    return NextResponse.json({ memory });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: 'db error', detail: message }, { status: 500 });
  }
}
