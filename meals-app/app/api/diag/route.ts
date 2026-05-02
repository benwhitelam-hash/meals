import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function findDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const keys = Object.keys(process.env).sort();
  for (const k of keys) {
    if (/_DATABASE_URL$/.test(k) && process.env[k]) return process.env[k]!;
  }
  for (const k of keys) {
    if (/_POSTGRES_URL$/.test(k) && !/PRISMA|NON_POOLING|NO_SSL/.test(k) && process.env[k]) {
      return process.env[k]!;
    }
  }
  return null;
}

export async function GET() {
  const dbRelatedKeys = Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|PG|NEON/i.test(k))
    .sort();

  const usableUrl = findDatabaseUrl();

  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      AUTH_USERS_JSON: !!process.env.AUTH_USERS_JSON,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '(unset)',
      VERCEL_ENV: process.env.VERCEL_ENV || '(unset)',
    },
    db_url_resolved: !!usableUrl,
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
