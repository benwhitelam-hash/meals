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
