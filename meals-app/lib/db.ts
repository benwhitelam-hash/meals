/**
 * Database connection. Uses Neon's serverless HTTP driver.
 *
 * Looks for the connection URL in multiple env var names — handles:
 *   - DATABASE_URL (manual / standard convention)
 *   - POSTGRES_URL (Vercel-Postgres convention)
 *   - *_DATABASE_URL or *_POSTGRES_URL (Vercel marketplace integrations
 *     that prefix their vars to avoid collisions, e.g. Neon's
 *     "Prefix_Meals_PinkCrocodile_DATABASE_URL")
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

function findDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;

  // Look for prefixed integration vars (in deterministic order — alphabetical)
  const keys = Object.keys(process.env).sort();
  for (const k of keys) {
    if (/_DATABASE_URL$/.test(k) && process.env[k]) return process.env[k]!;
  }
  for (const k of keys) {
    if (/_POSTGRES_URL$/.test(k) && !/PRISMA|NON_POOLING|NO_SSL/.test(k) && process.env[k]) {
      return process.env[k]!;
    }
  }

  throw new Error(
    'No database URL found. Set DATABASE_URL, POSTGRES_URL, or attach a Neon integration.'
  );
}

export function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(findDatabaseUrl());
  }
  return _sql;
}
