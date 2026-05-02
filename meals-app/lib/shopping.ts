/**
 * Shopping list storage layer.
 *
 * One open list at a time per household. Items are categorised for
 * supermarket aisle ordering. Source tracks where items came from
 * (manual / from a meal plan's recipes).
 *
 * Auto-migration on first query.
 */

import { sql } from './db';
import { getPlan } from './plans';
import { getRecipe } from './recipes';

export const CATEGORIES = [
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
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
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

export type ItemSource = 'manual' | 'recipe' | 'plan';

export interface ShoppingListItem {
  id: string;
  list_id: string;
  content: string;
  category: Category;
  source: ItemSource;
  recipe_id: string | null;
  checked: boolean;
  added_by: string;
  added_at: string;
}

export interface ShoppingList {
  id: string;
  created_at: string;
  completed_at: string | null;
  source_week: string | null;
  created_by: string;
  items: ShoppingListItem[];
}

let _migrated = false;
async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at    timestamptz NOT NULL DEFAULT now(),
      completed_at  timestamptz,
      source_week   date,
      created_by    text NOT NULL
    )
  `;
  await sql()`
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      list_id     uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      content     text NOT NULL,
      category    text NOT NULL DEFAULT 'other',
      source      text NOT NULL DEFAULT 'manual',
      recipe_id   uuid,
      checked     boolean NOT NULL DEFAULT false,
      added_by    text NOT NULL,
      added_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS shopping_lists_active_idx
      ON shopping_lists (completed_at, created_at DESC)
  `;
  await sql()`
    CREATE INDEX IF NOT EXISTS shopping_list_items_list_idx
      ON shopping_list_items (list_id)
  `;
  _migrated = true;
}

// --------------------------------------------------------------------------
// Read
// --------------------------------------------------------------------------

/** The currently-open list, or null. */
export async function getActiveList(): Promise<ShoppingList | null> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, created_at, completed_at, source_week::text AS source_week, created_by
    FROM shopping_lists
    WHERE completed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const list = rows[0] as Omit<ShoppingList, 'items'>;
  const items = await listItems(list.id);
  return { ...list, items };
}

export async function getList(id: string): Promise<ShoppingList | null> {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, created_at, completed_at, source_week::text AS source_week, created_by
    FROM shopping_lists
    WHERE id = ${id}
  `;
  if (rows.length === 0) return null;
  const list = rows[0] as Omit<ShoppingList, 'items'>;
  const items = await listItems(list.id);
  return { ...list, items };
}

async function listItems(listId: string): Promise<ShoppingListItem[]> {
  const rows = await sql()`
    SELECT id, list_id, content, category, source, recipe_id, checked, added_by, added_at
    FROM shopping_list_items
    WHERE list_id = ${listId}
    ORDER BY added_at ASC
  `;
  return rows as ShoppingListItem[];
}

// --------------------------------------------------------------------------
// Write
// --------------------------------------------------------------------------

export async function createList(
  createdBy: string,
  sourceWeek?: string
): Promise<ShoppingList> {
  await ensureSchema();
  const rows = await sql()`
    INSERT INTO shopping_lists (created_by, source_week)
    VALUES (${createdBy}, ${sourceWeek ?? null}::date)
    RETURNING id, created_at, completed_at, source_week::text AS source_week, created_by
  `;
  return { ...(rows[0] as Omit<ShoppingList, 'items'>), items: [] };
}

export async function completeList(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql()`
    UPDATE shopping_lists
    SET completed_at = now()
    WHERE id = ${id} AND completed_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function addItem(item: {
  list_id: string;
  content: string;
  category: Category;
  source: ItemSource;
  recipe_id?: string | null;
  added_by: string;
}): Promise<ShoppingListItem> {
  await ensureSchema();
  const rows = await sql()`
    INSERT INTO shopping_list_items (list_id, content, category, source, recipe_id, added_by)
    VALUES (
      ${item.list_id}::uuid,
      ${item.content},
      ${item.category},
      ${item.source},
      ${item.recipe_id ?? null}::uuid,
      ${item.added_by}
    )
    RETURNING id, list_id, content, category, source, recipe_id, checked, added_by, added_at
  `;
  return rows[0] as ShoppingListItem;
}

export async function setItemChecked(
  itemId: string,
  checked: boolean
): Promise<ShoppingListItem | null> {
  await ensureSchema();
  const rows = await sql()`
    UPDATE shopping_list_items
    SET checked = ${checked}
    WHERE id = ${itemId}
    RETURNING id, list_id, content, category, source, recipe_id, checked, added_by, added_at
  `;
  return (rows[0] as ShoppingListItem) || null;
}

export async function deleteItem(itemId: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql()`
    DELETE FROM shopping_list_items WHERE id = ${itemId} RETURNING id
  `;
  return rows.length > 0;
}

// --------------------------------------------------------------------------
// Generation: pull recipe ingredients from a meal plan into a list
// --------------------------------------------------------------------------

interface GenerateResult {
  list: ShoppingList;
  added: number; // items newly added (excluding duplicates)
  skipped_duplicates: number;
  skipped_no_ingredients: number;
}

export async function generateFromPlan(
  weekStart: string,
  createdBy: string,
  categorize: (names: string[]) => Promise<Record<string, Category>>
): Promise<GenerateResult | null> {
  const plan = await getPlan(weekStart);
  if (!plan || plan.entries.length === 0) return null;

  const recipeEntries = plan.entries.filter(
    (e) => e.kind === 'recipe' && e.recipe_id
  );
  if (recipeEntries.length === 0) return null;

  // Collect ingredients across recipes, deduping by lowercased name
  const itemsByName = new Map<
    string,
    { displayName: string; recipe_id: string }
  >();
  let recipesWithoutIngredients = 0;

  for (const entry of recipeEntries) {
    const recipe = await getRecipe(entry.recipe_id!);
    if (!recipe) continue;
    if (recipe.ingredients.length === 0) {
      recipesWithoutIngredients++;
      continue;
    }
    for (const ing of recipe.ingredients) {
      const key = ing.name.toLowerCase().trim();
      if (!key || itemsByName.has(key)) continue;
      itemsByName.set(key, { displayName: ing.name, recipe_id: recipe.id });
    }
  }

  // Get or create the active list
  let list = await getActiveList();
  if (!list) {
    list = await createList(createdBy, weekStart);
  }

  // Filter out items already on the list
  const existingNames = new Set(
    list.items.map((i) => i.content.toLowerCase().trim())
  );
  const toAdd: { displayName: string; recipe_id: string }[] = [];
  let skippedDuplicates = 0;
  for (const [key, val] of itemsByName) {
    if (existingNames.has(key)) {
      skippedDuplicates++;
      continue;
    }
    toAdd.push(val);
  }

  if (toAdd.length === 0) {
    return {
      list: (await getList(list.id))!,
      added: 0,
      skipped_duplicates: skippedDuplicates,
      skipped_no_ingredients: recipesWithoutIngredients,
    };
  }

  // Categorise via Haiku
  const categories = await categorize(toAdd.map((t) => t.displayName));

  // Insert
  for (const item of toAdd) {
    await addItem({
      list_id: list.id,
      content: item.displayName,
      category: categories[item.displayName] ?? 'other',
      source: 'recipe',
      recipe_id: item.recipe_id,
      added_by: createdBy,
    });
  }

  return {
    list: (await getList(list.id))!,
    added: toAdd.length,
    skipped_duplicates: skippedDuplicates,
    skipped_no_ingredients: recipesWithoutIngredients,
  };
}

// --------------------------------------------------------------------------
// Prompt formatter — gives the chat awareness of the current list
// --------------------------------------------------------------------------

export function shoppingForPrompt(list: ShoppingList | null): string {
  if (!list || list.items.length === 0) {
    return 'Current shopping list: (empty or none)';
  }
  const lines = [`Current shopping list (${list.items.length} items):`];
  const checked = list.items.filter((i) => i.checked).length;
  lines.push(`(${checked} checked off)`);
  // Group by category
  for (const cat of CATEGORIES) {
    const items = list.items.filter((i) => i.category === cat);
    if (items.length === 0) continue;
    lines.push(`  ${CATEGORY_LABELS[cat]}: ${items.map((i) => i.content).join(', ')}`);
  }
  return lines.join('\n');
}

// Stop here — schema, CRUD, generation, and prompt formatter are above.
