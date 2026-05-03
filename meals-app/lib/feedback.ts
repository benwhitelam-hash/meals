/**
 * Feedback / ideas storage layer.
 *
 * Captures user-submitted feature ideas and UX suggestions.
 * Stored centrally so they can be browsed on the /feedback page.
 *
 * Schema is auto-created on first query.
 */

import { sql } from './db';

export type FeedbackArea =
  | 'meals'      // The chat / kitchen page
  | 'recipes'    // The recipe collection
  | 'plan'       // The week plan
  | 'shopping'   // The shopping list
  | 'general';   // Cross-cutting / unknown

export const FEEDBACK_AREAS: FeedbackArea[] = [
  'meals',
  'recipes',
  'plan',
  'shopping',
  'general',
];

export const FEEDBACK_AREA_LABELS: Record<FeedbackArea, string> = {
  meals: 'Meals chat',
  recipes: 'Recipes',
  plan: 'Plan',
  shopping: 'Shopping',
  general: 'General',
};

export type FeedbackStatus = 'open' | 'reviewed' | 'done' | 'wontdo';

export interface Feedback {
  id: string;
  area: FeedbackArea;
  content: string;
  status: FeedbackStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

let _migrated = false;
async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS feedback (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      area        text NOT NULL,
      content     text NOT NULL,
      status      text NOT NULL DEFAULT 'open',
      created_by  text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  _migrated = true;
}

function normaliseArea(raw: string | undefined): FeedbackArea {
  const v = (raw ?? '').toLowerCase().trim();
  if ((FEEDBACK_AREAS as string[]).includes(v)) return v as FeedbackArea;
  return 'general';
}

function normaliseStatus(raw: string | undefined): FeedbackStatus {
  const v = (raw ?? '').toLowerCase().trim();
  if (['open', 'reviewed', 'done', 'wontdo'].includes(v)) return v as FeedbackStatus;
  return 'open';
}

export async function listFeedback(): Promise<Feedback[]> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id::text AS id, area, content, status,
           created_by, created_at, updated_at
    FROM feedback
    ORDER BY created_at DESC
  `;
  return rows as Feedback[];
}

export async function createFeedback(input: {
  area?: string;
  content: string;
  created_by: string;
}): Promise<Feedback> {
  await ensureSchema();
  const area = normaliseArea(input.area);
  const content = input.content.trim();
  if (!content) throw new Error('feedback content required');
  if (content.length > 4000) throw new Error('feedback too long');

  const rows = await sql()`
    INSERT INTO feedback (area, content, created_by)
    VALUES (${area}, ${content}, ${input.created_by})
    RETURNING id::text AS id, area, content, status,
              created_by, created_at, updated_at
  `;
  return rows[0] as Feedback;
}

export async function updateFeedbackStatus(
  id: string,
  status: string
): Promise<Feedback | null> {
  await ensureSchema();
  const s = normaliseStatus(status);
  const rows = await sql()`
    UPDATE feedback
    SET status = ${s}, updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id::text AS id, area, content, status,
              created_by, created_at, updated_at
  `;
  return (rows[0] as Feedback) ?? null;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql()`
    DELETE FROM feedback WHERE id = ${id}::uuid RETURNING id
  `;
  return rows.length > 0;
}
