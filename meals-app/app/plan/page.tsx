'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppHeader } from '../_components/AppHeader';

// --------------------------------------------------------------------------
// Types (mirror lib/plans.ts shape — kept in sync manually)
// --------------------------------------------------------------------------

type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const ALL_DAYS: DayCode[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<DayCode, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const DAY_SHORT: Record<DayCode, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

interface PrepAhead {
  text: string;
  days_before?: number;
}

interface PlanEntry {
  day: DayCode;
  kind: 'recipe' | 'freetext';
  recipe_id?: string;
  text?: string;
  notes?: string;
  prep_ahead?: PrepAhead;
}

interface PlanActivity {
  day: DayCode;
  text: string;
  notes?: string;
}

interface MealPlan {
  week_start: string;
  entries: PlanEntry[];
  activities: PlanActivity[];
  created_at: string;
  updated_at: string;
  updated_by: string;
}

interface Recipe {
  id: string;
  name: string;
}

// --------------------------------------------------------------------------
// Date helpers (client side — mirror lib/plans.ts)
// --------------------------------------------------------------------------

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date = new Date()): string {
  const date = new Date(d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return isoDate(date);
}

function shiftWeeks(weekStart: string, weeks: number): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return isoDate(d);
}

function dayDate(weekStart: string, day: DayCode): Date {
  const offset = ALL_DAYS.indexOf(day);
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d;
}

function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startStr = start.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const endStr = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function PlanPage() {
  const today = useMemo(() => mondayOf(), []);
  const [weekStart, setWeekStart] = useState<string>(today);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<DayCode | null>(null);

  // Load plan when weekStart changes
  const loadPlan = useCallback(async (week: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plans/${week}`);
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      } else {
        setPlan(null);
      }
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recipes once
  useEffect(() => {
    fetch('/api/recipes')
      .then((r) => (r.ok ? r.json() : { recipes: [] }))
      .then((d) => setRecipes(d.recipes || []))
      .catch(() => setRecipes([]));
  }, []);

  useEffect(() => {
    loadPlan(weekStart);
  }, [weekStart, loadPlan]);

  const recipeById = useMemo(() => {
    const map: Record<string, Recipe> = {};
    for (const r of recipes) map[r.id] = r;
    return map;
  }, [recipes]);

  const filledCount = plan?.entries.length ?? 0;
  const isToday = weekStart === today;

  async function handleSaveEntry(day: DayCode, entry: Omit<PlanEntry, 'day'>) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, action: 'set', ...entry }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
        setEditingDay(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleClearEntry(day: DayCode) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, action: 'clear' }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
        setEditingDay(null);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSaveActivity(
    day: DayCode,
    text: string,
    notes?: string
  ) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day,
          action: 'set_activity',
          text,
          ...(notes ? { notes } : {}),
        }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleClearActivity(day: DayCode) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, action: 'clear_activity' }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleSavePrep(
    day: DayCode,
    text: string,
    days_before: number
  ) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, action: 'set_prep', text, days_before }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleClearPrep(day: DayCode) {
    try {
      const res = await fetch(`/api/plans/${weekStart}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, action: 'clear_prep' }),
      });
      if (res.ok) {
        const { plan: newPlan } = await res.json();
        setPlan(newPlan);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <AppHeader />
      <main className="plan-shell">
        <div className="plan-toolbar">
          <button
            className="icon-btn plan-nav-btn"
            onClick={() => setWeekStart((w) => shiftWeeks(w, -1))}
            aria-label="Previous week"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="plan-week-label">
            <h1>{weekRangeLabel(weekStart)}</h1>
            <span className="plan-week-meta">
              {filledCount === 0
                ? 'Nothing planned yet'
                : `${filledCount} of 7 dinners planned`}
            </span>
          </div>

          <div className="plan-toolbar-right">
            {!isToday && (
              <button className="btn btn-ghost" onClick={() => setWeekStart(today)}>
                This week
              </button>
            )}
            <button
              className="icon-btn plan-nav-btn"
              onClick={() => setWeekStart((w) => shiftWeeks(w, 1))}
              aria-label="Next week"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {loading && plan === null ? (
          <div className="plan-loading">Loading…</div>
        ) : (
          <div className="plan-grid">
            {ALL_DAYS.map((day) => {
              const entry = plan?.entries.find((e) => e.day === day);
              const activity = plan?.activities.find((a) => a.day === day);
              const date = dayDate(weekStart, day);
              const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
              const isThisDay =
                isoDate(date) === isoDate(new Date());

              // Look up prep that's DUE on this day (for a meal on a later day).
              // E.g. if Wed has a meal with prep_ahead.days_before=1, the Tuesday cell
              // shows "prep tonight: ...".
              const prepDueToday = findPrepDueOnDay(plan, day);

              return (
                <DayCell
                  key={day}
                  day={day}
                  date={date}
                  entry={entry}
                  activity={activity}
                  recipe={entry?.recipe_id ? recipeById[entry.recipe_id] : undefined}
                  prepDue={prepDueToday}
                  isPast={isPast}
                  isToday={isThisDay}
                  onClick={() => setEditingDay(day)}
                />
              );
            })}
          </div>
        )}

        <div className="plan-empty-hint">
          {filledCount === 0 && !loading && (
            <p>
              Tap any day to add a meal — pick a saved recipe or write something quick like
              &ldquo;takeaway&rdquo;. Or ask the kitchen to plan the week for you.
            </p>
          )}
        </div>
      </main>

      {editingDay && (
        <DayEditModal
          day={editingDay}
          date={dayDate(weekStart, editingDay)}
          existing={plan?.entries.find((e) => e.day === editingDay)}
          existingActivity={plan?.activities.find((a) => a.day === editingDay)}
          recipes={recipes}
          onSave={(entry) => handleSaveEntry(editingDay, entry)}
          onClear={() => handleClearEntry(editingDay)}
          onSaveActivity={(text, notes) =>
            handleSaveActivity(editingDay, text, notes)
          }
          onClearActivity={() => handleClearActivity(editingDay)}
          onSavePrep={(text, days_before) =>
            handleSavePrep(editingDay, text, days_before)
          }
          onClearPrep={() => handleClearPrep(editingDay)}
          onCancel={() => setEditingDay(null)}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Day cell
// --------------------------------------------------------------------------

interface PrepDueInfo {
  text: string;
  forDay: DayCode;
  forMealName: string;
}

function findPrepDueOnDay(
  plan: MealPlan | null,
  day: DayCode
): PrepDueInfo | null {
  if (!plan) return null;
  const dayIdx = ALL_DAYS.indexOf(day);
  for (const entry of plan.entries) {
    if (!entry.prep_ahead?.text) continue;
    const days = entry.prep_ahead.days_before ?? 1;
    const mealIdx = ALL_DAYS.indexOf(entry.day);
    if (mealIdx - days === dayIdx) {
      const mealName =
        entry.kind === 'recipe'
          ? '(saved recipe)'
          : entry.text || '(meal)';
      return {
        text: entry.prep_ahead.text,
        forDay: entry.day,
        forMealName: mealName,
      };
    }
  }
  return null;
}

function DayCell({
  day,
  date,
  entry,
  activity,
  recipe,
  prepDue,
  isPast,
  isToday,
  onClick,
}: {
  day: DayCode;
  date: Date;
  entry?: PlanEntry;
  activity?: PlanActivity;
  recipe?: Recipe;
  prepDue?: PrepDueInfo | null;
  isPast: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  const dateNum = date.getDate();
  const monthShort = date.toLocaleDateString('en-GB', { month: 'short' });
  const hasContent = !!entry || !!activity || !!prepDue;

  return (
    <button
      className={`day-cell ${hasContent ? 'filled' : 'empty'} ${isPast ? 'past' : ''} ${
        isToday ? 'today' : ''
      } ${prepDue ? 'has-prep' : ''}`}
      onClick={onClick}
      aria-label={`${DAY_LABELS[day]} ${dateNum} ${monthShort}: ${
        entry
          ? entry.kind === 'recipe'
            ? recipe?.name || 'recipe'
            : entry.text
          : 'no meal planned, click to add'
      }${activity ? `; activity: ${activity.text}` : ''}${
        prepDue ? `; prep needed: ${prepDue.text} for ${DAY_LABELS[prepDue.forDay]}` : ''
      }`}
    >
      <div className="day-cell-head">
        <span className="day-name">{DAY_SHORT[day]}</span>
        <span className="day-num">{dateNum}</span>
      </div>
      <div className="day-cell-body">
        {entry ? (
          entry.kind === 'recipe' ? (
            <>
              <div className="day-meal-name">
                {recipe?.name || <em>(deleted recipe)</em>}
              </div>
              {entry.notes && <div className="day-meal-notes">{entry.notes}</div>}
            </>
          ) : (
            <>
              <div className="day-meal-name day-meal-text">{entry.text}</div>
              {entry.notes && <div className="day-meal-notes">{entry.notes}</div>}
            </>
          )
        ) : (
          <div className="day-empty-hint">{activity ? '' : '+ add'}</div>
        )}
      </div>
      {activity && (
        <div className="day-activity">
          <span className="day-activity-label">on:</span>{' '}
          <span className="day-activity-text">{activity.text}</span>
          {activity.notes && (
            <span className="day-activity-notes"> · {activity.notes}</span>
          )}
        </div>
      )}
      {prepDue && (
        <div className="day-prep" aria-label={`Prep ahead: ${prepDue.text}`}>
          <span className="day-prep-label" aria-hidden="true">
            📌 prep
          </span>{' '}
          <span className="day-prep-text">{prepDue.text}</span>
          <span className="day-prep-for">
            {' '}
            · for {DAY_SHORT[prepDue.forDay]}
          </span>
        </div>
      )}
    </button>
  );
}

// --------------------------------------------------------------------------
// Day-edit modal
// --------------------------------------------------------------------------

function DayEditModal({
  day,
  date,
  existing,
  existingActivity,
  recipes,
  onSave,
  onClear,
  onSaveActivity,
  onClearActivity,
  onSavePrep,
  onClearPrep,
  onCancel,
}: {
  day: DayCode;
  date: Date;
  existing?: PlanEntry;
  existingActivity?: PlanActivity;
  recipes: Recipe[];
  onSave: (e: Omit<PlanEntry, 'day'>) => void;
  onClear: () => void;
  onSaveActivity: (text: string, notes?: string) => Promise<void>;
  onClearActivity: () => Promise<void>;
  onSavePrep: (text: string, days_before: number) => Promise<void>;
  onClearPrep: () => Promise<void>;
  onCancel: () => void;
}) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    existing?.kind === 'recipe' ? existing.recipe_id! : null
  );
  const [freeText, setFreeText] = useState<string>(
    existing?.kind === 'freetext' ? existing.text! : ''
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? '');
  const [search, setSearch] = useState('');
  const [activityText, setActivityText] = useState<string>(
    existingActivity?.text ?? ''
  );
  const [activityNotes, setActivityNotes] = useState<string>(
    existingActivity?.notes ?? ''
  );
  const [prepText, setPrepText] = useState<string>(existing?.prep_ahead?.text ?? '');
  const [prepDays, setPrepDays] = useState<number>(
    existing?.prep_ahead?.days_before ?? 1
  );

  // Picking a recipe clears free text and vice versa — they're mutually exclusive
  function pickRecipe(id: string) {
    setSelectedRecipeId(id);
    setFreeText('');
  }
  function setFreeTextSelection(t: string) {
    setFreeText(t);
    if (t.trim()) setSelectedRecipeId(null);
  }

  const filtered = search.trim()
    ? recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : recipes;

  async function save() {
    // Save the meal if any meal is selected
    const mealChanged =
      (selectedRecipeId && selectedRecipeId !== existing?.recipe_id) ||
      (freeText.trim() && freeText.trim() !== existing?.text) ||
      (notes.trim() !== (existing?.notes ?? ''));

    // Save the activity if changed
    const trimmedActivity = activityText.trim();
    const trimmedActivityNotes = activityNotes.trim();
    const activityChanged =
      trimmedActivity !== (existingActivity?.text ?? '') ||
      trimmedActivityNotes !== (existingActivity?.notes ?? '');

    // Activity-only updates: handle separately
    if (activityChanged) {
      if (trimmedActivity) {
        await onSaveActivity(
          trimmedActivity,
          trimmedActivityNotes || undefined
        );
      } else if (existingActivity) {
        await onClearActivity();
      }
    }

    // Prep changes — only when there's an existing meal entry to attach to.
    // If user added a meal in this same save, the meal save will include prep
    // (we pass it through onSave below). For an existing meal, do separate calls.
    const trimmedPrep = prepText.trim();
    const existingPrepText = existing?.prep_ahead?.text ?? '';
    const existingPrepDays = existing?.prep_ahead?.days_before ?? 1;
    const prepChanged =
      trimmedPrep !== existingPrepText ||
      (trimmedPrep && prepDays !== existingPrepDays);

    if (prepChanged && existing && !mealChanged) {
      if (trimmedPrep) {
        await onSavePrep(trimmedPrep, prepDays);
      } else if (existing.prep_ahead) {
        await onClearPrep();
      }
    }

    // Meal updates use the existing onSave path (which closes the modal).
    // If only activity/prep changed, close the modal manually after.
    if (selectedRecipeId) {
      onSave({
        kind: 'recipe',
        recipe_id: selectedRecipeId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(trimmedPrep
          ? { prep_ahead: { text: trimmedPrep, days_before: prepDays } }
          : {}),
      });
    } else if (freeText.trim()) {
      onSave({
        kind: 'freetext',
        text: freeText.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(trimmedPrep
          ? { prep_ahead: { text: trimmedPrep, days_before: prepDays } }
          : {}),
      });
    } else if (!mealChanged) {
      // Nothing meal-related; close manually
      onCancel();
    }
  }

  const canSave =
    !!selectedRecipeId ||
    !!freeText.trim() ||
    activityText.trim() !== (existingActivity?.text ?? '') ||
    activityNotes.trim() !== (existingActivity?.notes ?? '') ||
    prepText.trim() !== (existing?.prep_ahead?.text ?? '') ||
    (prepText.trim() &&
      prepDays !== (existing?.prep_ahead?.days_before ?? 1));
  const dateLabel = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <>
      <div className="scrim" onClick={onCancel} aria-hidden="true" />
      <div
        className="day-modal"
        role="dialog"
        aria-label={`Plan for ${DAY_LABELS[day]}`}
        onKeyDown={onKeyDown}
      >
        <div className="day-modal-header">
          <h2>{dateLabel}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="day-modal-body">
          {recipes.length > 0 && (
            <div className="day-section">
              <div className="day-section-title">Pick a saved recipe</div>
              {recipes.length > 5 && (
                <input
                  type="search"
                  className="recipes-search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              <div className="day-recipe-options">
                {filtered.map((r) => (
                  <label key={r.id} className="day-recipe-option">
                    <input
                      type="radio"
                      name="recipe"
                      checked={selectedRecipeId === r.id}
                      onChange={() => pickRecipe(r.id)}
                    />
                    <span>{r.name}</span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="day-empty-state">No matches.</div>
                )}
              </div>
            </div>
          )}

          <div className="day-section">
            <div className="day-section-title">
              {recipes.length > 0 ? 'Or write something else' : 'What\'s for dinner?'}
            </div>
            <input
              type="text"
              className="day-freetext-input"
              placeholder="e.g. takeaway, leftovers, out for dinner"
              value={freeText}
              onChange={(e) => setFreeTextSelection(e.target.value)}
            />
          </div>

          <div className="day-section">
            <div className="day-section-title">Meal notes (optional)</div>
            <input
              type="text"
              className="day-freetext-input"
              placeholder="e.g. double the rice, eating late"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="day-section day-activity-section">
            <div className="day-section-title">What's on this evening?</div>
            <div className="hint">
              Optional — note anything that affects dinner planning, e.g. book club, gym, late
              meeting.
            </div>
            <input
              type="text"
              className="day-freetext-input"
              placeholder="e.g. book club 8pm"
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
            />
            {activityText.trim() && (
              <input
                type="text"
                className="day-freetext-input"
                style={{ marginTop: '8px' }}
                placeholder="Activity notes (optional) — e.g. eating before"
                value={activityNotes}
                onChange={(e) => setActivityNotes(e.target.value)}
              />
            )}
          </div>

          <div className="day-section day-prep-section">
            <div className="day-section-title">Prep ahead?</div>
            <div className="hint">
              Optional — flag any prep this meal needs done in advance (defrost, soak, marinate,
              start sourdough). The reminder will show on the day you should do the prep.
            </div>
            <input
              type="text"
              className="day-freetext-input"
              placeholder="e.g. take chicken out of freezer"
              value={prepText}
              onChange={(e) => setPrepText(e.target.value)}
            />
            {prepText.trim() && (
              <div className="day-prep-days-row">
                <label htmlFor="prep-days" className="day-prep-days-label">
                  How far ahead?
                </label>
                <select
                  id="prep-days"
                  className="day-prep-days-select"
                  value={prepDays}
                  onChange={(e) => setPrepDays(parseInt(e.target.value, 10))}
                >
                  <option value={1}>1 day before (the night before)</option>
                  <option value={2}>2 days before</option>
                  <option value={3}>3 days before</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="day-modal-foot">
          {existing && (
            <button className="btn btn-ghost day-clear-btn" onClick={onClear}>
              Clear meal
            </button>
          )}
          <div className="day-modal-foot-right">
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
