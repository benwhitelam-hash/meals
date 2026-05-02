/**
 * Diagnostic endpoint. Returns no secret values — just presence flags
 * and connection status. Safe to leave deployed; will be removed once
 * the memory feature is verified working.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      AUTH_USERS_JSON: !!process.env.AUTH_USERS_JSON,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '(unset)',
    },
  };

  // Test DB connectivity if URL is set
  if (process.env.DATABASE_URL) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);

      // Test 1: Can we connect at all?
      const versionResult = await sql`SELECT version() as v`;
      checks.db_connect = 'ok';
      checks.pg_version = (versionResult[0] as { v: string })?.v?.slice(0, 50);

      // Test 2: Does the meal_memories table exist?
      try {
        const countResult = await sql`SELECT COUNT(*)::int as c FROM meal_memories`;
        checks.table_exists = true;
        checks.memory_count = (countResult[0] as { c: number })?.c;
      } catch (tableError) {
        checks.table_exists = false;
        checks.table_error =
          tableError instanceof Error ? tableError.message : 'unknown';
      }
    } catch (connError) {
      checks.db_connect = 'failed';
      checks.db_error = connError instanceof Error ? connError.message : 'unknown';
    }
  } else {
    checks.db_connect = 'skipped (no DATABASE_URL)';
  }

  return NextResponse.json(checks);
}
