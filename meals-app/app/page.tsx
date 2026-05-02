'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CrocMark } from './croc';

interface Message {
  role: 'user' | 'assistant';
  content: string;
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
  { kicker: 'Treat', text: 'A weekend dinner that feels a bit special' },
];

export default function MealsPage() {
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [draftPrefs, setDraftPrefs] = useState<Preferences>(DEFAULT_PREFS);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load identity & preferences on mount
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
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  // Auto-resize composer textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input]);

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
          setMessages([...next, { role: 'assistant', content: data.content }]);
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

  function openDrawer() {
    setDraftPrefs(prefs);
    setDrawerOpen(true);
  }

  function savePrefs() {
    setPrefs(draftPrefs);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(draftPrefs));
    } catch {
      /* ignore */
    }
    setDrawerOpen(false);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      <header className="app-header">
        <a href="/" className="brand" aria-label="Pink Crocodile — Meals">
          <CrocMark size={28} />
          <span>
            pink crocodile <span className="brand-sep">·</span> meals
          </span>
        </a>
        <div className="user-menu">
          {me && (
            <span className="who">
              <strong>{me}</strong>
            </span>
          )}
          <button
            className="icon-btn"
            onClick={openDrawer}
            aria-label="Household preferences"
            title="Household preferences"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="btn btn-ghost" onClick={logout} title="Sign out">
            Sign out
          </button>
        </div>
      </header>

      <main className="shell">
        {isEmpty && (
          <section className="intro">
            <div className="eyebrow">The kitchen</div>
            <h1>
              What are we <em>cooking</em>?
            </h1>
            <p>
              Ideas, recipes, weekly plans, shopping lists — ask anything. I&apos;ll factor in
              the household preferences you&apos;ve set.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  className="suggestion"
                  onClick={() => send(s.text)}
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
          <div className="thread">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-meta">{m.role === 'user' ? me || 'you' : 'kitchen'}</div>
                <div className="msg-body">{m.content}</div>
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

      {drawerOpen && (
        <>
          <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="drawer" role="dialog" aria-label="Household preferences">
            <div className="drawer-header">
              <h2>Household preferences</h2>
              <button
                className="icon-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <PrefField
                label="Household"
                hint="Who's eating? E.g. 2 adults, plus a dog who'd love any leftovers."
                value={draftPrefs.household}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, household: v })}
                placeholder="2 adults in Warwickshire."
              />
              <PrefField
                label="Dietary requirements"
                hint="Allergies, intolerances, anything you don't eat."
                value={draftPrefs.dietary}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, dietary: v })}
                placeholder="None — happy with most things."
              />
              <PrefField
                label="Dislikes"
                hint="Ingredients to avoid. Be honest, no judgement."
                value={draftPrefs.dislikes}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, dislikes: v })}
                placeholder="Olives, blue cheese."
              />
              <PrefField
                label="Cuisines you enjoy"
                hint="What gets you excited at a restaurant menu?"
                value={draftPrefs.cuisines}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, cuisines: v })}
                placeholder="Italian, Japanese, modern British."
              />
              <PrefField
                label="Kitchen equipment"
                hint="Anything beyond the basics worth knowing about."
                value={draftPrefs.equipment}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, equipment: v })}
                placeholder="Pizza oven, slow cooker, decent knives."
              />
              <PrefField
                label="Other notes"
                hint="Anything else the kitchen should know."
                value={draftPrefs.notes}
                onChange={(v) => setDraftPrefs({ ...draftPrefs, notes: v })}
                placeholder="We tend to eat by 7. Saturday is the bigger cook."
              />
            </div>
            <div className="drawer-foot">
              <button className="btn btn-ghost" onClick={() => setDrawerOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={savePrefs}>
                Save
              </button>
            </div>
          </aside>
        </>
      )}
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
