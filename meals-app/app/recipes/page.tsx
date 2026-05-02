'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppHeader } from '../_components/AppHeader';

interface Ingredient {
  name: string;
  quantity?: string;
}

interface Recipe {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  name: string;
  body_md: string;
  ingredients: Ingredient[];
}

type Mode = 'view' | 'edit' | 'new';

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<{ name: string; body_md: string }>({
    name: '',
    body_md: '',
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Load recipes
  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recipes');
      if (res.ok) {
        const data = await res.json();
        setRecipes(data.recipes || []);
        // Auto-select the most recent if nothing selected
        if (!selectedId && data.recipes?.length) {
          setSelectedId(data.recipes[0].id);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize the body textarea in edit mode
  useEffect(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 300) + 'px';
  }, [draft.body_md, mode]);

  const selected = recipes.find((r) => r.id === selectedId) || null;

  const filtered = search.trim()
    ? recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.body_md.toLowerCase().includes(search.toLowerCase())
      )
    : recipes;

  function startNew() {
    setSelectedId(null);
    setMode('new');
    setDraft({ name: '', body_md: '' });
  }

  function startEdit() {
    if (!selected) return;
    setMode('edit');
    setDraft({ name: selected.name, body_md: selected.body_md });
  }

  function cancelEdit() {
    setMode('view');
    setDraft({ name: '', body_md: '' });
    if (recipes.length && !selectedId) setSelectedId(recipes[0].id);
  }

  async function save() {
    if (!draft.name.trim() || !draft.body_md.trim() || saving) return;
    setSaving(true);
    try {
      if (mode === 'new') {
        const res = await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (res.ok) {
          const { recipe } = await res.json();
          setRecipes((curr) => [recipe, ...curr]);
          setSelectedId(recipe.id);
          setMode('view');
        }
      } else if (mode === 'edit' && selected) {
        const res = await fetch(`/api/recipes/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (res.ok) {
          const { recipe } = await res.json();
          setRecipes((curr) =>
            curr.map((r) => (r.id === recipe.id ? recipe : r)).sort(byUpdated)
          );
          setMode('view');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/recipes/${selected.id}`, { method: 'DELETE' });
      setRecipes((curr) => curr.filter((r) => r.id !== selected.id));
      const remaining = recipes.filter((r) => r.id !== selected.id);
      setSelectedId(remaining.length ? remaining[0].id : null);
      setMode('view');
    } catch {
      /* ignore */
    }
  }

  const showEmptyState = !loading && recipes.length === 0 && mode !== 'new';

  return (
    <>
      <AppHeader />
      <main className="recipes-shell">
        <aside className="recipes-list">
          <div className="recipes-list-head">
            <h1 className="recipes-title">Recipes</h1>
            <button
              className="btn btn-primary recipes-new-btn"
              onClick={startNew}
              disabled={mode === 'new'}
            >
              + New
            </button>
          </div>

          {recipes.length > 3 && (
            <input
              type="search"
              className="recipes-search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          {loading && <div className="recipes-list-empty">Loading…</div>}

          {showEmptyState && (
            <div className="recipes-list-empty">
              <p>No recipes yet.</p>
              <p className="recipes-empty-hint">
                Add one here, or describe a dish in chat — Claude will save it for you.
              </p>
            </div>
          )}

          <ul className="recipes-list-items">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setSelectedId(r.id);
                    setMode('view');
                  }}
                  className={`recipe-list-item ${
                    r.id === selectedId && mode !== 'new' ? 'selected' : ''
                  }`}
                >
                  <div className="recipe-list-name">{r.name}</div>
                  <div className="recipe-list-meta">
                    {r.ingredients.length > 0 && (
                      <span>{r.ingredients.length} ingredients · </span>
                    )}
                    <span>{formatRelative(r.updated_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="recipe-detail">
          {mode === 'new' || mode === 'edit' ? (
            <RecipeEditor
              draft={draft}
              setDraft={setDraft}
              bodyRef={bodyRef}
              onSave={save}
              onCancel={cancelEdit}
              saving={saving}
              isNew={mode === 'new'}
            />
          ) : selected ? (
            <RecipeView recipe={selected} onEdit={startEdit} onDelete={remove} />
          ) : (
            <div className="recipe-detail-empty">
              <p>Select a recipe to view, or create a new one.</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

// =================================================================
// Sub-components
// =================================================================

function RecipeView({
  recipe,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="recipe-article">
      <header className="recipe-article-head">
        <div>
          <h2 className="recipe-article-name">{recipe.name}</h2>
          <div className="recipe-article-meta">
            Added by {recipe.created_by} · {formatRelative(recipe.updated_at)}
          </div>
        </div>
        <div className="recipe-article-actions">
          <button className="btn btn-ghost" onClick={onEdit}>
            Edit
          </button>
          <button className="icon-btn recipe-delete" onClick={onDelete} aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="recipe-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{recipe.body_md}</ReactMarkdown>
      </div>

      {recipe.ingredients.length > 0 && (
        <details className="recipe-ingredients-extracted">
          <summary>
            Auto-extracted ingredients ({recipe.ingredients.length}) — used for shopping lists
          </summary>
          <ul>
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.name}
                {ing.quantity ? ` · ${ing.quantity}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function RecipeEditor({
  draft,
  setDraft,
  bodyRef,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: { name: string; body_md: string };
  setDraft: (d: { name: string; body_md: string }) => void;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="recipe-editor" onKeyDown={onKeyDown}>
      <header className="recipe-article-head">
        <h2 className="recipe-article-name">
          {isNew ? 'New recipe' : 'Editing recipe'}
        </h2>
        <div className="recipe-article-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={!draft.name.trim() || !draft.body_md.trim() || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="field">
        <label htmlFor="recipe-name">Name</label>
        <input
          id="recipe-name"
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Friday tray bake"
          autoFocus
        />
      </div>

      <div className="field">
        <label htmlFor="recipe-body">Recipe</label>
        <div className="hint">
          Markdown supported. Use <code>## Ingredients</code> and <code>## Method</code>{' '}
          headings if you like, or just write it however you want.
        </div>
        <textarea
          id="recipe-body"
          ref={bodyRef}
          value={draft.body_md}
          onChange={(e) => setDraft({ ...draft, body_md: e.target.value })}
          placeholder="Cube two chicken breasts. Marinate in yogurt + garlic + tandoori spice for 20 min..."
          rows={10}
          className="recipe-body-input"
        />
        <div className="hint editor-tip">⌘/Ctrl + Enter to save, Esc to cancel</div>
      </div>
    </div>
  );
}

// =================================================================
// Helpers
// =================================================================

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function byUpdated(a: Recipe, b: Recipe): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}
