import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, AUTH_COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ user: null }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: session.username });
}
