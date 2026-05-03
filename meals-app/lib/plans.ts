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

export interface PrepAhead {
  text: string;          // e.g. "soak chickpeas overnight"
  days_before?: number;  // 1 by default (the day before the meal). Allow 1-3.
}

export interface PlanEntry {
  day: DayCode;
  kind: EntryKind;
  recipe_id?: string;
  text?: string;
  notes?: string;
  prep_ahead?: PrepAhead;
}

export interface PlanActivity {
  day: DayCode;
  text: string;
  notes?: string;
}

export interface MealPlan {
  week_start: string; // ISO date YYYY-MM-DD
  entries: PlanEntry[];
  activities: PlanActivity[];
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
  // Activities column added later — idempotent ALTER for existing deployments.
  await sql()`
    ALTER TABLE meal_plans
    ADD COLUMN IF NOT EXISTS activities jsonb NOT NULL DEFAULT '[]'::jsonb
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
    SELECT
      week_start::text AS week_start,
      entries,
      COALESCE(activities, '[]'::jsonb) AS activities,
      created_at, updated_at, updated_by
    FROM meal_plans
    WHERE week_start = ${weekStart}::date
  `;
  return (rows[0] as MealPlan) || null;
}

/**
 * Replace the entire week's entries. Used by propose_meal_plan and the API.
 * Upsert pattern — creates the row if missing.
 * Note: this only touches `entries`, not `activities` (those have their own setters).
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
    RETURNING
      week_start::text AS week_start,
      entries,
      COALESCE(activities, '[]'::jsonb) AS activities,
      created_at, updated_at, updated_by
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
    // Normalise prep_ahead — drop empties, clamp days_before to 1..3
    if (e.prep_ahead) {
      const text = e.prep_ahead.text?.trim();
      if (!text) {
        delete e.prep_ahead;
      } else {
        const dbRaw = e.prep_ahead.days_before;
        const db = typeof dbRaw === 'number' && dbRaw >= 1 && dbRaw <= 3 ? Math.floor(dbRaw) : 1;
        e.prep_ahead = { text, days_before: db };
      }
    }
    return true;
  });
}

/** Same idea for activities — one per day, dedupe, drop blanks. */
function sanitiseActivities(activities: PlanActivity[]): PlanActivity[] {
  const seen = new Set<DayCode>();
  return activities.filter((a) => {
    if (!ALL_DAYS.includes(a.day)) return false;
    if (seen.has(a.day)) return false;
    if (!a.text?.trim()) return false;
    seen.add(a.day);
    return true;
  });
}

/**
 * Set or replace the activity for a single day.
 * Creates the plan row if missing (with empty entries, just this activity).
 */
export async function setActivity(
  weekStart: string,
  day: DayCode,
  activity: Omit<PlanActivity, 'day'>,
  updatedBy: string
): Promise<MealPlan> {
  await ensureSchema();
  const existing = await getPlan(weekStart);
  const currentActivities = existing?.activities ?? [];
  const filtered = currentActivities.filter((a) => a.day !== day);
  filtered.push({ ...activity, day });
  const cleaned = sanitiseActivities(filtered);
  const json = JSON.stringify(cleaned);

  const rows = await sql()`
    INSERT INTO meal_plans (week_start, entries, activities, updated_by)
    VALUES (${weekStart}::date, '[]'::jsonb, ${json}::jsonb, ${updatedBy})
    ON CONFLICT (week_start)
    DO UPDATE SET
      activities = EXCLUDED.activities,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by
    RETURNING
      week_start::text AS week_start,
      entries,
      COALESCE(activities, '[]'::jsonb) AS activities,
      created_at, updated_at, updated_by
  `;
  return rows[0] as MealPlan;
}

export async function clearActivity(
  weekStart: string,
  day: DayCode,
  updatedBy: string
): Promise<MealPlan | null> {
  await ensureSchema();
  const existing = await getPlan(weekStart);
  if (!existing) return null;
  const filtered = existing.activities.filter((a) => a.day !== day);
  const json = JSON.stringify(filtered);

  const rows = await sql()`
    UPDATE meal_plans
    SET activities = ${json}::jsonb,
        updated_at = now(),
        updated_by = ${updatedBy}
    WHERE week_start = ${weekStart}::date
    RETURNING
      week_start::text AS week_start,
      entries,
      COALESCE(activities, '[]'::jsonb) AS activities,
      created_at, updated_at, updated_by
  `;
  return (rows[0] as MealPlan) ?? null;
}

/**
 * Set or update the prep_ahead flag on an existing meal entry.
 * Returns null if there's no entry on that day to attach prep to.
 */
export async function setMealPrepAhead(
  weekStart: string,
  day: DayCode,
  prep: PrepAhead,
  updatedBy: string
): Promise<MealPlan | null> {
  const plan = await getPlan(weekStart);
  if (!plan) return null;
  const target = plan.entries.find((e) => e.day === day);
  if (!target) return null;
  const updated = plan.entries.map((e) =>
    e.day === day ? { ...e, prep_ahead: prep } : e
  );
  return setPlan(weekStart, updated, updatedBy);
}

/** Remove the prep_ahead flag from an entry (entry stays). */
export async function clearMealPrepAhead(
  weekStart: string,
  day: DayCode,
  updatedBy: string
): Promise<MealPlan | null> {
  const plan = await getPlan(weekStart);
  if (!plan) return null;
  const updated = plan.entries.map((e) => {
    if (e.day !== day) return e;
    const copy = { ...e };
    delete copy.prep_ahead;
    return copy;
  });
  return setPlan(weekStart, updated, updatedBy);
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
  const hasMeals = plan && plan.entries.length > 0;
  const hasActivities = plan && plan.activities.length > 0;
  if (!plan || (!hasMeals && !hasActivities)) {
    return `Plan for week starting ${weekStart}: (empty)`;
  }
  const lines = [`Plan for week starting ${weekStart}:`];
  for (const day of ALL_DAYS) {
    const entry = plan.entries.find((e) => e.day === day);
    const activity = plan.activities.find((a) => a.day === day);

    let mealLine: string;
    if (!entry) {
      mealLine = '—';
    } else {
      const main =
        entry.kind === 'recipe'
          ? `${recipeNames[entry.recipe_id!] ?? '(unknown recipe)'}` +
            (entry.recipe_id ? ` [recipe id: ${entry.recipe_id}]` : '')
          : `"${entry.text}"`;
      const notes = entry.notes ? ` — ${entry.notes}` : '';
      mealLine = `${main}${notes}`;
    }

    let line = `- ${DAY_LABELS[day]}: ${mealLine}`;
    if (entry?.prep_ahead) {
      const db = entry.prep_ahead.days_before ?? 1;
      line += `  [prep ${db}d ahead: ${entry.prep_ahead.text}]`;
    }
    if (activity) {
      const actNotes = activity.notes ? ` (${activity.notes})` : '';
      line += `  [activity: ${activity.text}${actNotes}]`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
