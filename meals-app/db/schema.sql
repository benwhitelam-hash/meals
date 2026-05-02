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
