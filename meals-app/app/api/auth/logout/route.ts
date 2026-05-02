import { NextResponse } from 'next/server';
import { COOKIE_OPTIONS } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...COOKIE_OPTIONS, value: '', maxAge: 0 });
  return res;
}
