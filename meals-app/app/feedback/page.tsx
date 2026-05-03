'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../_components/AppHeader';

type FeedbackArea = 'meals' | 'recipes' | 'plan' | 'shopping' | 'general';
type FeedbackStatus = 'open' | 'reviewed' | 'done' | 'wontdo';

interface Feedback {
  id: string;
  area: FeedbackArea;
  content: string;
  status: FeedbackStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const AREA_LABELS: Record<FeedbackArea, string> = {
  meals: 'Meals chat',
  recipes: 'Recipes',
  plan: 'Plan',
  shopping: 'Shopping',
  general: 'General',
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  reviewed: 'Reviewed',
  done: 'Done',
  wontdo: "Won't do",
};

const ALL_AREAS: FeedbackArea[] = ['meals', 'recipes', 'plan', 'shopping', 'general'];
const ALL_STATUSES: FeedbackStatus[] = ['open', 'reviewed', 'done', 'wontdo'];

export default function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState<FeedbackArea | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [hideDone, setHideDone] = useState(false);

  // Inline submission form
  const [newContent, setNewContent] = useState('');
  const [newArea, setNewArea] = useState<FeedbackArea>('general');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        const data = await res.json();
        setItems(data.feedback || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function submitNew() {
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim(), area: newArea }),
      });
      if (res.ok) {
        setNewContent('');
        setNewArea('general');
        await load();
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(id: string, status: FeedbackStatus) {
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => prev.map((f) => (f.id === id ? data.feedback : f)));
      }
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this feedback? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((f) => f.id !== id));
      }
    } catch {
      /* ignore */
    }
  }

  const filtered = useMemo(() => {
    return items.filter((f) => {
      if (areaFilter !== 'all' && f.area !== areaFilter) return false;
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (hideDone && (f.status === 'done' || f.status === 'wontdo')) return false;
      return true;
    });
  }, [items, areaFilter, statusFilter, hideDone]);

  const counts = useMemo(() => {
    const c = { open: 0, reviewed: 0, done: 0, wontdo: 0, total: items.length };
    for (const f of items) c[f.status] += 1;
    return c;
  }, [items]);

  return (
    <>
      <AppHeader />
      <main className="feedback-shell">
        <header className="feedback-head">
          <div className="eyebrow">Ideas &amp; feedback</div>
          <h1>
            What could be <em>better</em>?
          </h1>
          <p className="feedback-intro">
            Captured from chat or submitted here directly. Stored centrally — visible to anyone
            using the site, so you and Jenny can both see and triage.
          </p>
        </header>

        {/* Inline submit form */}
        <section className="feedback-submit">
          <div className="feedback-submit-head">
            <h2>Submit an idea</h2>
            <span className="hint">Or just tell the chat — same result.</span>
          </div>
          <textarea
            className="feedback-submit-text"
            placeholder="Describe the idea, improvement, or bug. The clearer the better — someone reading this later won't have your context."
            rows={3}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            disabled={submitting}
          />
          <div className="feedback-submit-row">
            <label className="feedback-submit-area">
              <span>Area</span>
              <select
                value={newArea}
                onChange={(e) => setNewArea(e.target.value as FeedbackArea)}
                disabled={submitting}
              >
                {ALL_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary"
              onClick={submitNew}
              disabled={!newContent.trim() || submitting}
            >
              {submitting ? 'Saving…' : 'Save idea'}
            </button>
          </div>
        </section>

        {/* Filters + count summary */}
        <section className="feedback-filters">
          <div className="feedback-counts">
            <span>
              <strong>{counts.total}</strong> total
            </span>
            <span className="feedback-count-pill kind-open">{counts.open} open</span>
            <span className="feedback-count-pill kind-reviewed">
              {counts.reviewed} reviewed
            </span>
            <span className="feedback-count-pill kind-done">{counts.done} done</span>
            {counts.wontdo > 0 && (
              <span className="feedback-count-pill kind-wontdo">{counts.wontdo} won't do</span>
            )}
          </div>
          <div className="feedback-filter-row">
            <label className="feedback-filter">
              <span>Area</span>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value as FeedbackArea | 'all')}
              >
                <option value="all">All</option>
                {ALL_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="feedback-filter">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as FeedbackStatus | 'all')
                }
              >
                <option value="all">All</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="feedback-filter feedback-filter-toggle">
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)}
              />
              <span>Hide done</span>
            </label>
          </div>
        </section>

        {/* List */}
        <section className="feedback-list">
          {loading ? (
            <div className="feedback-loading">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="feedback-empty">
              {items.length === 0
                ? 'No ideas yet. Tell the chat what would make this better, or submit one above.'
                : 'No matches for these filters.'}
            </div>
          ) : (
            filtered.map((f) => (
              <article key={f.id} className={`feedback-card status-${f.status}`}>
                <div className="feedback-card-head">
                  <span className={`feedback-area-tag area-${f.area}`}>
                    {AREA_LABELS[f.area]}
                  </span>
                  <span className={`feedback-status-tag status-${f.status}`}>
                    {STATUS_LABELS[f.status]}
                  </span>
                  <span className="feedback-card-meta">
                    {f.created_by} · {formatDate(f.created_at)}
                  </span>
                </div>
                <p className="feedback-card-content">{f.content}</p>
                <div className="feedback-card-actions">
                  <select
                    className="feedback-status-select"
                    value={f.status}
                    onChange={(e) =>
                      changeStatus(f.id, e.target.value as FeedbackStatus)
                    }
                    aria-label="Change status"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="feedback-delete-btn"
                    onClick={() => remove(f.id)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
