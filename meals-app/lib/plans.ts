/**
 * Meal-plan storage layer.
 *
 * One row per week, keyed by week_start (Monday of that week).
 * Entries stored as JSONB — flexible, fast, simple.
 *
 * Schema is auto-created on first query (CREATE TABLE IF NOT EXISTS).
 */

import { sql } from './db';

export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const ALL_DAYS: DayCode[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS: Record<DayCode, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export type EntryKind = 'recipe' | 'freetext';

export interface PlanEntry {
  day: DayCode;
  kind: EntryKind;
  recipe_id?: string;
  text?: string;
  notes?: string;
}

export interface MealPlan {
  week_start: string; // ISO date YYYY-MM-DD
  entries: PlanEntry[];
  created_at: string;
  updated_at: string;
  updated_by: string;
}

let _migrated = false;
async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS meal_plans (
      week_start  date PRIMARY KEY,
      entries     jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  text NOT NULL
    )
  `;
  _migrated = true;
}

// --------------------------------------------------------------------------
// Date helpers
// --------------------------------------------------------------------------

/** Returns YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing the given date. Returns YYYY-MM-DD. */
export function mondayOf(d: Date = new Date()): string {
  const date = new Date(d);
  const dow = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return isoDate(date);
}

/** Add (or subtract, with negative) weeks to an ISO date. */
export function shiftWeeks(isoYmd: string, weeks: number): string {
  const d = new Date(isoYmd + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return isoDate(d);
}

/** "Mon 5 May" — short label for a day given week_start and day code. */
export function dayDateLabel(weekStart: string, day: DayCode): string {
  const offset = ALL_DAYS.indexOf(day);
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Mon 5 – Sun 11 May 2026" range for a week_start */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('en-GB', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' }),
  });
  const endStr = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

// --------------------------------------------------------------------------
// CRUD
// --------------------------------------------------------------------------

export async function getPlan(weekStart: string): Promise<MealPlan | null> {
  await ensureSchema();
  const rows = await sql()`
    SELECT week_start::text AS week_start, entries, created_at, updated_at, updated_by
    FROM meal_plans
    WHERE week_start = ${weekStart}::date
  `;
  return (rows[0] as MealPlan) || null;
}

/**
 * Replace the entire week's entries. Used by propose_meal_plan and the API.
 * Upsert pattern — creates the row if missing.
 */
export async function setPlan(
  weekStart: string,
  entries: PlanEntry[],
  updatedBy: string
): Promise<MealPlan> {
  await ensureSchema();
  const cleaned = sanitiseEntries(entries);
  const json = JSON.stringify(cleaned);
  const rows = await sql()`
    INSERT INTO meal_plans (week_start, entries, updated_by)
    VALUES (${weekStart}::date, ${json}::jsonb, ${updatedBy})
    ON CONFLICT (week_start)
    DO UPDATE SET
      entries = EXCLUDED.entries,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by
    RETURNING week_start::text AS week_start, entries, created_at, updated_at, updated_by
  `;
  return rows[0] as MealPlan;
}

/** Set or replace a single day's entry within a week. */
export async function setEntry(
  weekStart: string,
  day: DayCode,
  entry: Omit<PlanEntry, 'day'>,
  updatedBy: string
): Promise<MealPlan> {
  const existing = (await getPlan(weekStart))?.entries ?? [];
  const filtered = existing.filter((e) => e.day !== day);
  filtered.push({ ...entry, day });
  return setPlan(weekStart, filtered, updatedBy);
}

/** Remove a single day's entry from a week. */
export async function clearEntry(
  weekStart: string,
  day: DayCode,
  updatedBy: string
): Promise<MealPlan> {
  const existing = (await getPlan(weekStart))?.entries ?? [];
  const filtered = existing.filter((e) => e.day !== day);
  return setPlan(weekStart, filtered, updatedBy);
}

/** Sanity-check entries before persisting. Filters out invalid ones silently. */
function sanitiseEntries(entries: PlanEntry[]): PlanEntry[] {
  const seen = new Set<DayCode>();
  return entries.filter((e) => {
    if (!ALL_DAYS.includes(e.day)) return false;
    if (seen.has(e.day)) return false; // dedupe same-day entries
    seen.add(e.day);
    if (e.kind === 'recipe' && !e.recipe_id) return false;
    if (e.kind === 'freetext' && !e.text?.trim()) return false;
    return true;
  });
}

// --------------------------------------------------------------------------
// Prompt formatter — used by the chat to know what the current plan looks like
// --------------------------------------------------------------------------

interface RecipeNameLookup {
  [id: string]: string;
}

export function planForPrompt(
  plan: MealPlan | null,
  weekStart: string,
  recipeNames: RecipeNameLookup
): string {
  if (!plan || plan.entries.length === 0) {
    return `Plan for week starting ${weekStart}: (empty)`;
  }
  const lines = [`Plan for week starting ${weekStart}:`];
  for (const day of ALL_DAYS) {
    const entry = plan.entries.find((e) => e.day === day);
    if (!entry) {
      lines.push(`- ${DAY_LABELS[day]}: —`);
      continue;
    }
    const main =
      entry.kind === 'recipe'
        ? `${recipeNames[entry.recipe_id!] ?? '(unknown recipe)'}` +
          (entry.recipe_id ? ` [recipe id: ${entry.recipe_id}]` : '')
        : `"${entry.text}"`;
    const notes = entry.notes ? ` — ${entry.notes}` : '';
    lines.push(`- ${DAY_LABELS[day]}: ${main}${notes}`);
  }
  return lines.join('\n');
}
