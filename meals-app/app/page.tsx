'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppHeader } from './_components/AppHeader';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type MemoryKind = 'love' | 'avoid' | 'context';
type MemorySource = 'explicit' | 'extracted';

interface Memory {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  kind: MemoryKind;
  content: string;
  source: MemorySource;
}

interface Recipe {
  id: string;
  name: string;
}

interface ChatAction {
  type:
    | 'remembered'
    | 'forgot'
    | 'recipe_saved'
    | 'recipe_updated'
    | 'recipe_deleted'
    | 'plan_set'
    | 'plan_entry_set'
    | 'plan_entry_cleared'
    | 'shopping_list_generated'
    | 'shopping_item_added'
    | 'shopping_completed';
  memory?: Memory;
  recipe?: Recipe;
  added_count?: number;
  week_start?: string;
  day?: string;
  id?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  chatActions?: ChatAction[];
}

interface Preferences {
  household: string;
  dietary: string;
  dislikes: string;
  cuisines: string;
  equipment: string;
  notes: string;
}

const DEFAULT_PREFS: Preferences = {
  household: '',
  dietary: '',
  dislikes: '',
  cuisines: '',
  equipment: '',
  notes: '',
};

const PREFS_KEY = 'pc_meals_prefs_v1';

const SUGGESTIONS = [
  { kicker: 'Plan', text: 'Plan dinners for the week ahead' },
  { kicker: 'Quick', text: 'Something on the table in 25 minutes tonight' },
  { kicker: 'Use up', text: 'I have chicken thighs and a tin of tomatoes' },
  { kicker: 'Save', text: "Let me describe a dish to remember — it's…" },
];

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function MealsPage() {
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [draftPrefs, setDraftPrefs] = useState<Preferences>(DEFAULT_PREFS);

  const [memOpen, setMemOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memLoading, setMemLoading] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ----- bootstrap
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));

    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        const parsed = { ...DEFAULT_PREFS, ...JSON.parse(stored) };
        setPrefs(parsed);
        setDraftPrefs(parsed);
      }
    } catch {
      /* ignore */
    }
    refreshMemories();
  }, []);

  // Hydrate the chat thread from localStorage once we know who we are.
  // Keyed by username so Ben and Jenny don't share chat history on the same browser.
  useEffect(() => {
    if (!me || chatHydrated) return;
    try {
      const stored = localStorage.getItem(`pc_chat_${me}_v1`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
    setChatHydrated(true);
  }, [me, chatHydrated]);

  // Persist messages whenever they change (after hydration).
  useEffect(() => {
    if (!me || !chatHydrated) return;
    try {
      if (messages.length === 0) {
        localStorage.removeItem(`pc_chat_${me}_v1`);
      } else {
        localStorage.setItem(`pc_chat_${me}_v1`, JSON.stringify(messages));
      }
    } catch {
      /* ignore */
    }
  }, [messages, me, chatHydrated]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

  // ----- memories
  async function refreshMemories() {
    setMemLoading(true);
    try {
      const res = await fetch('/api/memories');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      /* ignore */
    } finally {
      setMemLoading(false);
    }
  }

  async function deleteMemoryHandler(id: string) {
    setMemories((curr) => curr.filter((m) => m.id !== id));
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    } catch {
      refreshMemories();
    }
  }

  async function addMemoryHandler(kind: MemoryKind, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, content: trimmed }),
      });
      if (res.ok) {
        const { memory } = await res.json();
        setMemories((curr) => [memory, ...curr]);
      }
    } catch {
      /* ignore */
    }
  }

  // ----- chat
  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: Message = { role: 'user', content: text.trim() };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput('');
      setLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, preferences: prefs }),
        });
        const data = await res.json();
        if (res.ok && data.content) {
          setMessages([
            ...next,
            {
              role: 'assistant',
              content: data.content,
              chatActions: data.chatActions || [],
            },
          ]);
          if (Array.isArray(data.chatActions) && data.chatActions.length > 0) {
            setTimeout(refreshMemories, 200);
          }
          setTimeout(refreshMemories, 4000);
        } else {
          setMessages([
            ...next,
            {
              role: 'assistant',
              content: `Sorry — ${data.error || 'something went wrong'}.`,
            },
          ]);
        }
      } catch {
        setMessages([
          ...next,
          { role: 'assistant', content: 'Network error. Have another go in a moment.' },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, prefs]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function openPrefs() {
    setDraftPrefs(prefs);
    setPrefsOpen(true);
  }

  function savePrefs() {
    setPrefs(draftPrefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(draftPrefs));
    } catch {
      /* ignore */
    }
    setPrefsOpen(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <AppHeader
        showMemoryButton
        memoryCount={memories.length}
        onOpenMemory={() => setMemOpen(true)}
        onOpenPrefs={openPrefs}
      />

      <main className="shell">
        {isEmpty && (
          <section className="intro">
            <div className="eyebrow">The kitchen</div>
            <h1>
              What are we <em>cooking</em>?
            </h1>
            <p>
              Ideas, recipes, weekly plans, shopping lists — ask anything. I&apos;ll factor in
              what we know about your household, and remember new things as we chat.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  className="suggestion"
                  onClick={() => {
                    if (s.text.startsWith('Let me describe')) {
                      setInput(
                        'Quick recipe to remember: '
                      );
                      textareaRef.current?.focus();
                    } else {
                      send(s.text);
                    }
                  }}
                  disabled={loading}
                >
                  <span className="kicker">{s.kicker}</span>
                  {s.text}
                </button>
              ))}
            </div>
          </section>
        )}

        {!isEmpty && (
          <>
            <div className="thread-toolbar">
              <button
                className="thread-clear-btn"
                onClick={() => {
                  if (confirm('Start a new conversation? Current chat will be cleared.')) {
                    setMessages([]);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path
                    d="M12 2v6m0 0l-3-3m3 3l3-3M3 13c0 4.97 4.03 9 9 9s9-4.03 9-9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                New chat
              </button>
            </div>
            <div className="thread">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-meta">{m.role === 'user' ? 'you' : 'kitchen'}</div>
                <div className="msg-body">{m.content}</div>
                {m.chatActions && m.chatActions.length > 0 && (
                  <ChatActionsRow actions={m.chatActions} />
                )}
              </div>
            ))}
            {loading && (
              <div className="msg assistant">
                <div className="msg-meta">kitchen</div>
                <div className="thinking" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
          </>
        )}

        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isEmpty ? 'Ask the kitchen…' : 'Reply…'}
            rows={1}
            disabled={loading}
          />
          <button
            className="icon-btn send"
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </main>

      {prefsOpen && (
        <PreferencesDrawer
          draft={draftPrefs}
          setDraft={setDraftPrefs}
          onCancel={() => setPrefsOpen(false)}
          onSave={savePrefs}
        />
      )}

      {memOpen && (
        <MemoriesDrawer
          memories={memories}
          loading={memLoading}
          onClose={() => setMemOpen(false)}
          onDelete={deleteMemoryHandler}
          onAdd={addMemoryHandler}
          onRefresh={refreshMemories}
        />
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

function ChatActionsRow({ actions }: { actions: ChatAction[] }) {
  return (
    <div className="memory-actions">
      {actions.map((a, i) => {
        if (a.type === 'remembered' && a.memory) {
          return (
            <span key={i} className={`memory-pill kind-${a.memory.kind}`}>
              <PillIcon name="bookmark" />
              Remembered: {a.memory.content}
            </span>
          );
        }
        if (a.type === 'forgot') {
          return (
            <span key={i} className="memory-pill kind-forgot">
              <PillIcon name="trash" />
              Forgot a memory
            </span>
          );
        }
        if (a.type === 'recipe_saved' && a.recipe) {
          return (
            <a
              key={i}
              href="/recipes"
              className="memory-pill kind-recipe"
              title="View recipe"
            >
              <PillIcon name="book" />
              Saved recipe: {a.recipe.name}
            </a>
          );
        }
        if (a.type === 'recipe_updated' && a.recipe) {
          return (
            <a
              key={i}
              href="/recipes"
              className="memory-pill kind-recipe"
              title="View recipe"
            >
              <PillIcon name="edit" />
              Updated recipe: {a.recipe.name}
            </a>
          );
        }
        if (a.type === 'recipe_deleted') {
          return (
            <span key={i} className="memory-pill kind-forgot">
              <PillIcon name="trash" />
              Deleted a recipe
            </span>
          );
        }
        if (a.type === 'plan_set') {
          return (
            <a
              key={i}
              href="/plan"
              className="memory-pill kind-plan"
              title="View plan"
            >
              <PillIcon name="calendar" />
              Saved plan for week of {formatShortDate(a.week_start)}
            </a>
          );
        }
        if (a.type === 'plan_entry_set') {
          return (
            <a
              key={i}
              href="/plan"
              className="memory-pill kind-plan"
              title="View plan"
            >
              <PillIcon name="calendar" />
              Set {capitalise(a.day || '')} on week of{' '}
              {formatShortDate(a.week_start)}
            </a>
          );
        }
        if (a.type === 'plan_entry_cleared') {
          return (
            <span key={i} className="memory-pill kind-forgot">
              <PillIcon name="calendar" />
              Cleared {capitalise(a.day || '')}
            </span>
          );
        }
        if (a.type === 'shopping_list_generated') {
          return (
            <a
              key={i}
              href="/shopping"
              className="memory-pill kind-shopping"
              title="View shopping list"
            >
              <PillIcon name="basket" />
              Built shopping list ({a.added_count ?? 0} item
              {a.added_count === 1 ? '' : 's'} added)
            </a>
          );
        }
        if (a.type === 'shopping_item_added') {
          return (
            <a
              key={i}
              href="/shopping"
              className="memory-pill kind-shopping"
              title="View shopping list"
            >
              <PillIcon name="basket" />
              Added {a.added_count ?? 0} to shopping list
            </a>
          );
        }
        if (a.type === 'shopping_completed') {
          return (
            <span key={i} className="memory-pill kind-forgot">
              <PillIcon name="basket" />
              Marked shopping list done
            </span>
          );
        }
        return null;
      })}
    </div>
  );
}

function PillIcon({ name }: { name: 'bookmark' | 'trash' | 'book' | 'edit' | 'calendar' | 'basket' }) {
  if (name === 'bookmark')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    );
  if (name === 'trash')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    );
  if (name === 'book')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  if (name === 'edit')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
      </svg>
    );
  if (name === 'calendar')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
        <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    );
  if (name === 'basket')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d="M5 7l1 14h12l1-14M9 7V5a3 3 0 0 1 6 0v2M3 7h18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  return null;
}

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

function capitalise(s: string): string {
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}

function PreferencesDrawer({
  draft,
  setDraft,
  onCancel,
  onSave,
}: {
  draft: Preferences;
  setDraft: (p: Preferences) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <div className="scrim" onClick={onCancel} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label="Household preferences">
        <div className="drawer-header">
          <h2>Household preferences</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="drawer-body">
          <PrefField
            label="Household"
            hint="Who's eating? E.g. 2 adults, plus a dog who'd love any leftovers."
            value={draft.household}
            onChange={(v) => setDraft({ ...draft, household: v })}
            placeholder="2 adults in Warwickshire."
          />
          <PrefField
            label="Dietary requirements"
            hint="Allergies, intolerances, anything you don't eat."
            value={draft.dietary}
            onChange={(v) => setDraft({ ...draft, dietary: v })}
            placeholder="None — happy with most things."
          />
          <PrefField
            label="Dislikes"
            hint="Ingredients to avoid. Be honest, no judgement."
            value={draft.dislikes}
            onChange={(v) => setDraft({ ...draft, dislikes: v })}
            placeholder="Olives, blue cheese."
          />
          <PrefField
            label="Cuisines you enjoy"
            hint="What gets you excited at a restaurant menu?"
            value={draft.cuisines}
            onChange={(v) => setDraft({ ...draft, cuisines: v })}
            placeholder="Italian, Japanese, modern British."
          />
          <PrefField
            label="Kitchen equipment"
            hint="Anything beyond the basics worth knowing about."
            value={draft.equipment}
            onChange={(v) => setDraft({ ...draft, equipment: v })}
            placeholder="Pizza oven, slow cooker, decent knives."
          />
          <PrefField
            label="Other notes"
            hint="Anything else the kitchen should know."
            value={draft.notes}
            onChange={(v) => setDraft({ ...draft, notes: v })}
            placeholder="We tend to eat by 7. Saturday is the bigger cook."
          />
        </div>
        <div className="drawer-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </aside>
    </>
  );
}

function PrefField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && <div className="hint">{hint}</div>}
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function MemoriesDrawer({
  memories,
  loading,
  onClose,
  onDelete,
  onAdd,
  onRefresh,
}: {
  memories: Memory[];
  loading: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onAdd: (kind: MemoryKind, content: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [newKind, setNewKind] = useState<MemoryKind>('love');
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);

  const loves = memories.filter((m) => m.kind === 'love');
  const avoids = memories.filter((m) => m.kind === 'avoid');
  const ctx = memories.filter((m) => m.kind === 'context');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await onAdd(newKind, newContent);
      setNewContent('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label="Memories">
        <div className="drawer-header">
          <h2>Memories</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="icon-btn"
              onClick={onRefresh}
              aria-label="Refresh"
              title="Refresh"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M21 12a9 9 0 1 1-3.5-7.1L21 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M21 3v4h-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          {memories.length === 0 && !loading && (
            <div className="empty-state">
              <p>
                Nothing remembered yet. Tell the kitchen what you love or avoid in chat —
                or add something here directly.
              </p>
            </div>
          )}

          {loves.length > 0 && (
            <MemoryGroup title="Loved" items={loves} onDelete={onDelete} />
          )}
          {avoids.length > 0 && (
            <MemoryGroup title="Avoided" items={avoids} onDelete={onDelete} />
          )}
          {ctx.length > 0 && <MemoryGroup title="Context" items={ctx} onDelete={onDelete} />}

          <form onSubmit={submit} className="memory-add">
            <div className="memory-add-title">Add a memory</div>
            <div className="memory-add-row">
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as MemoryKind)}
              >
                <option value="love">Loved</option>
                <option value="avoid">Avoid</option>
                <option value="context">Context</option>
              </select>
              <input
                type="text"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="e.g. Loved the Thai green curry as a weeknight option"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!newContent.trim() || adding}
            >
              {adding ? 'Saving…' : 'Save memory'}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function MemoryGroup({
  title,
  items,
  onDelete,
}: {
  title: string;
  items: Memory[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="memory-group">
      <h3 className="memory-group-title">{title}</h3>
      <ul className="memory-list">
        {items.map((m) => (
          <li key={m.id} className="memory-item">
            <div className="memory-content">
              <p>{m.content}</p>
              <div className="memory-meta">
                {m.source === 'extracted' ? '🌱 auto' : '📌 explicit'} · {m.created_by} ·{' '}
                {formatDate(m.created_at)}
              </div>
            </div>
            <button
              className="icon-btn memory-delete"
              onClick={() => onDelete(m.id)}
              aria-label="Forget this"
              title="Forget this"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
