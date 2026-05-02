'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppHeader } from '../_components/AppHeader';

// --------------------------------------------------------------------------
// Types — mirror lib/shopping.ts shape
// --------------------------------------------------------------------------

const CATEGORIES = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'frozen',
  'pantry',
  'drinks',
  'household',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  produce: 'Produce',
  meat: 'Meat & fish',
  dairy: 'Dairy & eggs',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry',
  drinks: 'Drinks',
  household: 'Household',
  other: 'Other',
};

interface ShoppingListItem {
  id: string;
  list_id: string;
  content: string;
  category: Category;
  source: 'manual' | 'recipe' | 'plan';
  recipe_id: string | null;
  checked: boolean;
  added_by: string;
  added_at: string;
}

interface ShoppingList {
  id: string;
  created_at: string;
  completed_at: string | null;
  source_week: string | null;
  created_by: string;
  items: ShoppingListItem[];
}

// --------------------------------------------------------------------------
// Date helpers
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
function weekShortLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function ShoppingPage() {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const thisWeek = useMemo(() => mondayOf(), []);
  const nextWeek = useMemo(() => shiftWeeks(thisWeek, 1), [thisWeek]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shopping');
      if (res.ok) {
        const data = await res.json();
        setList(data.list);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-clear status message after 3 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  // Group items by category, only including non-empty groups
  const grouped = useMemo(() => {
    if (!list) return [];
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: list.items.filter((i) => i.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [list]);

  const checkedCount = list?.items.filter((i) => i.checked).length ?? 0;
  const totalCount = list?.items.length ?? 0;

  async function addItem(content: string) {
    const trimmed = content.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/shopping/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        const { item, duplicate } = await res.json();
        if (duplicate) {
          setStatusMessage(`"${trimmed}" was already on the list`);
        } else {
          setList((curr) =>
            curr
              ? { ...curr, items: [...curr.items, item] }
              : null
          );
          setNewItem('');
        }
      }
      // If list didn't exist, fetch it back
      if (!list) {
        await refresh();
        setNewItem('');
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item: ShoppingListItem) {
    const newChecked = !item.checked;
    // Optimistic update
    setList((curr) =>
      curr
        ? {
            ...curr,
            items: curr.items.map((i) =>
              i.id === item.id ? { ...i, checked: newChecked } : i
            ),
          }
        : null
    );
    try {
      await fetch(`/api/shopping/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: newChecked }),
      });
    } catch {
      // Revert on error
      refresh();
    }
  }

  async function removeItem(itemId: string) {
    setList((curr) =>
      curr
        ? { ...curr, items: curr.items.filter((i) => i.id !== itemId) }
        : null
    );
    try {
      await fetch(`/api/shopping/items/${itemId}`, { method: 'DELETE' });
    } catch {
      refresh();
    }
  }

  async function generate(week: string) {
    if (generating) return;
    setGenerating(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/shopping/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: week }),
      });
      if (res.ok) {
        const data = await res.json();
        setList(data.list);
        if (data.added === 0 && data.skipped_duplicates > 0) {
          setStatusMessage(
            `All ${data.skipped_duplicates} items already on the list — nothing new added.`
          );
        } else if (data.added === 0) {
          setStatusMessage(
            "No new items — the recipes might not have ingredients extracted yet."
          );
        } else {
          let msg = `Added ${data.added} item${data.added === 1 ? '' : 's'}`;
          if (data.skipped_duplicates > 0) msg += ` (skipped ${data.skipped_duplicates} duplicate${data.skipped_duplicates === 1 ? '' : 's'})`;
          msg += '.';
          setStatusMessage(msg);
        }
      } else if (res.status === 404) {
        const data = await res.json();
        setStatusMessage(data.error || 'Nothing to generate from that week.');
      } else {
        setStatusMessage('Could not generate — try again.');
      }
    } catch {
      setStatusMessage('Network error — try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function markDone() {
    if (!list || !confirm('Mark this list as done? You can start a fresh one after.')) return;
    try {
      await fetch(`/api/shopping/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      setList(null);
      setStatusMessage('List marked as done. Generate or add to start a new one.');
    } catch {
      /* ignore */
    }
  }

  function onAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(newItem);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="shopping-shell">
        <div className="shopping-header">
          <div>
            <h1 className="shopping-title">Shopping list</h1>
            {list && (
              <div className="shopping-meta">
                {totalCount === 0
                  ? 'Empty — add items below or generate from a meal plan'
                  : `${checkedCount} of ${totalCount} ticked off`}
              </div>
            )}
            {!list && !loading && (
              <div className="shopping-meta">
                No active list. Add an item or generate from a meal plan to start one.
              </div>
            )}
          </div>
          {list && totalCount > 0 && (
            <button className="btn btn-ghost shopping-done-btn" onClick={markDone}>
              Mark done
            </button>
          )}
        </div>

        <div className="shopping-generate-row">
          <button
            className="btn btn-ghost shopping-gen-btn"
            onClick={() => generate(thisWeek)}
            disabled={generating}
          >
            {generating ? 'Generating…' : `+ From this week (${weekShortLabel(thisWeek)})`}
          </button>
          <button
            className="btn btn-ghost shopping-gen-btn"
            onClick={() => generate(nextWeek)}
            disabled={generating}
          >
            {generating ? 'Generating…' : `+ From next week (${weekShortLabel(nextWeek)})`}
          </button>
        </div>

        {statusMessage && (
          <div className="shopping-status">{statusMessage}</div>
        )}

        {loading && !list && (
          <div className="shopping-empty">Loading…</div>
        )}

        {!loading && grouped.length === 0 && (
          <div className="shopping-empty">
            <p>Your list is empty.</p>
            <p className="shopping-empty-hint">
              Add items below, generate from a meal plan, or ask the kitchen in chat.
            </p>
          </div>
        )}

        <div className="shopping-groups">
          {grouped.map((g) => (
            <section key={g.category} className="shopping-group">
              <h2 className="shopping-group-title">{CATEGORY_LABELS[g.category]}</h2>
              <ul className="shopping-items">
                {g.items.map((item) => (
                  <li
                    key={item.id}
                    className={`shopping-item ${item.checked ? 'checked' : ''}`}
                  >
                    <label className="shopping-item-label">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleItem(item)}
                      />
                      <span className="shopping-item-content">{item.content}</span>
                    </label>
                    <button
                      className="icon-btn shopping-item-delete"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove"
                      title="Remove"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="shopping-add-row">
          <input
            type="text"
            placeholder="Add an item…"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={onAddKeyDown}
            disabled={adding}
            className="shopping-add-input"
          />
          <button
            className="btn btn-primary"
            onClick={() => addItem(newItem)}
            disabled={!newItem.trim() || adding}
          >
            {adding ? '…' : 'Add'}
          </button>
        </div>
      </main>
    </>
  );
}
