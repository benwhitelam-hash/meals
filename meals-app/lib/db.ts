/**
 * Database connection. Uses Neon's serverless HTTP driver — no persistent
 * connections to manage, fits cleanly into Vercel serverless functions.
 *
 * DATABASE_URL is auto-injected by the Neon-Vercel integration into all envs.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
