/**
 * Recipe storage layer.
 *
 * Recipes are mostly free-form markdown ("body_md") in the user's own voice.
 * A parallel `ingredients` JSONB column stores a Haiku-extracted structured
 * list — never shown directly to the user, but used downstream by the
 * shopping-list generator (Phase 3).
 *
 * Schema is auto-created on first query (CREATE TABLE IF NOT EXISTS).
 * Idempotent — safe to call repeatedly. ~50ms once per lambda cold-start.
 */

import { sql } from './db';

export interface Ingredient {
  name: string;
  quantity?: string;
}

export interface Recipe {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  name: string;
  body_md: string;
  ingredients: Ingredient[];
}

export interface NewRecipe {
  created_by: string;
  name: string;
  body_md: string;
  ingredients?: Ingredient[];
}

let _migrated = false;
async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS recipes (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      created_by  text NOT NULL,
      name        text NOT NULL,
      body_md     text NOT NULL,
      ingredients jsonb NOT NULL DEFAULT '[]'::jsonb
    )
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS recipes_recent_idx ON recipes (updated_at DESC)
  `;
  _migrated = true;
}

export async function listRecipes(): Promise<Recipe[]> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, created_at, updated_at, created_by, name, body_md, ingredients
    FROM recipes
    ORDER BY updated_at DESC
  `;
  return rows as Recipe[];
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, created_at, updated_at, created_by, name, body_md, ingredients
    FROM recipes
    WHERE id = ${id}
  `;
  return (rows[0] as Recipe) || null;
}

export async function createRecipe(r: NewRecipe): Promise<Recipe> {
  await ensureSchema();
  const ingredients = JSON.stringify(r.ingredients ?? []);
  const rows = await sql()`
    INSERT INTO recipes (created_by, name, body_md, ingredients)
    VALUES (${r.created_by}, ${r.name}, ${r.body_md}, ${ingredients}::jsonb)
    RETURNING id, created_at, updated_at, created_by, name, body_md, ingredients
  `;
  return rows[0] as Recipe;
}

export async function updateRecipe(
  id: string,
  changes: { name?: string; body_md?: string; ingredients?: Ingredient[] }
): Promise<Recipe | null> {
  await ensureSchema();
  // Use COALESCE so untouched fields keep their existing value
  const ingredientsJson =
    changes.ingredients !== undefined ? JSON.stringify(changes.ingredients) : null;

  const rows = await sql()`
    UPDATE recipes
    SET name        = COALESCE(${changes.name ?? null}, name),
        body_md     = COALESCE(${changes.body_md ?? null}, body_md),
        ingredients = COALESCE(${ingredientsJson}::jsonb, ingredients),
        updated_at  = now()
    WHERE id = ${id}
    RETURNING id, created_at, updated_at, created_by, name, body_md, ingredients
  `;
  return (rows[0] as Recipe) || null;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql()`
    DELETE FROM recipes WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Compact prompt format: just names + IDs in a list.
 * Full bodies are appended after if budget allows.
 */
export function recipesForPrompt(recipes: Recipe[]): string {
  if (recipes.length === 0) return '';

  const sections: string[] = ['', "Saved recipes (the household's own collection):"];

  for (const r of recipes) {
    const firstLine = r.body_md.split('\n')[0]?.slice(0, 80) || '';
    sections.push(`- [${r.id}] ${r.name} — ${firstLine}${firstLine.length === 80 ? '…' : ''}`);
  }

  // Full bodies under a fold, in case the user wants details
  sections.push('');
  sections.push('Full recipe bodies (use these when answering "what is in...", "how do I make..."):');
  sections.push('');
  for (const r of recipes) {
    sections.push(`### ${r.name} (id: ${r.id})`);
    sections.push(r.body_md);
    sections.push('');
  }

  sections.push(
    'When the user describes a new recipe, call save_recipe. ' +
      'When they tweak one, call update_recipe with the id. ' +
      'When they want one removed, call delete_recipe with the id. ' +
      'Reference saved recipes by name in conversation, never by id.'
  );

  return sections.join('\n');
}
