-- Pink Crocodile · Meals app schema
-- Run this once in the Neon SQL Editor after connecting the database to Vercel.

CREATE TABLE IF NOT EXISTS meal_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('love', 'avoid', 'context')),
  content     text NOT NULL,
  source      text NOT NULL CHECK (source IN ('explicit', 'extracted'))
);

CREATE INDEX IF NOT EXISTS meal_memories_active_idx
  ON meal_memories (created_at DESC);

-- Recipes — household's own recipe collection in their own voice
-- Note: this is auto-created by lib/recipes.ts on first query (CREATE TABLE IF NOT EXISTS)
-- so you don't need to run this manually. Included here for documentation.

CREATE TABLE IF NOT EXISTS recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL,
  name        text NOT NULL,
  body_md     text NOT NULL,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS recipes_recent_idx ON recipes (updated_at DESC);

-- Meal plans — one row per week, entries as JSONB
-- Auto-created by lib/plans.ts on first query

CREATE TABLE IF NOT EXISTS meal_plans (
  week_start  date PRIMARY KEY,
  entries     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL
);

-- Shopping lists — one open list at a time, items grouped by category
-- Auto-created by lib/shopping.ts on first query

CREATE TABLE IF NOT EXISTS shopping_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  source_week   date,
  created_by    text NOT NULL
);

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
);

CREATE INDEX IF NOT EXISTS shopping_lists_active_idx ON shopping_lists (completed_at, created_at DESC);
CREATE INDEX IF NOT EXISTS shopping_list_items_list_idx ON shopping_list_items (list_id);
