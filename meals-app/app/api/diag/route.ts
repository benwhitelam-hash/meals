/**
 * Diagnostic endpoint. Returns env var KEYS (not values) and DB connectivity.
 * Safe to leave deployed; will be removed once memory is verified working.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  // List all env keys containing DB-related substrings (no values, just names)
  const dbRelatedKeys = Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|PG|NEON/i.test(k))
    .sort();

  // Try multiple known var names — Neon sets several depending on version
  const candidateUrls = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_POSTGRES_URL,
  ];
  const usableUrl = candidateUrls.find((u) => !!u);

  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      AUTH_USERS_JSON: !!process.env.AUTH_USERS_JSON,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '(unset)',
      VERCEL_ENV: process.env.VERCEL_ENV || '(unset)',
    },
    db_related_keys: dbRelatedKeys,
  };

  if (usableUrl) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(usableUrl);
      const v = await sql`SELECT version() as v`;
      checks.db_connect = 'ok';
      checks.pg_version = (v[0] as { v: string })?.v?.slice(0, 50);

      try {
        const c = await sql`SELECT COUNT(*)::int as c FROM meal_memories`;
        checks.table_exists = true;
        checks.memory_count = (c[0] as { c: number })?.c;
      } catch (te) {
        checks.table_exists = false;
        checks.table_error = te instanceof Error ? te.message : 'unknown';
      }
    } catch (ce) {
      checks.db_connect = 'failed';
      checks.db_error = ce instanceof Error ? ce.message : 'unknown';
    }
  } else {
    checks.db_connect = 'skipped (no DB url found in env)';
  }

  return NextResponse.json(checks);
}
