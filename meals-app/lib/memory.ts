/**
 * Memory layer for the meals app.
 * Wraps the meal_memories table and provides a helper to format
 * memories into the system prompt.
 */

import { sql } from './db';

export type MemoryKind = 'love' | 'avoid' | 'context';
export type MemorySource = 'explicit' | 'extracted';

export interface Memory {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  kind: MemoryKind;
  content: string;
  source: MemorySource;
}

export interface NewMemory {
  created_by: string;
  kind: MemoryKind;
  content: string;
  source: MemorySource;
}

/** All memories, newest first. */
export async function listMemories(): Promise<Memory[]> {
  const rows = await sql()`
    SELECT id, created_at, updated_at, created_by, kind, content, source
    FROM meal_memories
    ORDER BY created_at DESC
  `;
  return rows as Memory[];
}

export async function createMemory(m: NewMemory): Promise<Memory> {
  const rows = await sql()`
    INSERT INTO meal_memories (created_by, kind, content, source)
    VALUES (${m.created_by}, ${m.kind}, ${m.content}, ${m.source})
    RETURNING id, created_at, updated_at, created_by, kind, content, source
  `;
  return rows[0] as Memory;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM meal_memories WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

export async function updateMemoryContent(
  id: string,
  content: string
): Promise<Memory | null> {
  const rows = await sql()`
    UPDATE meal_memories
    SET content = ${content}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, created_at, updated_at, created_by, kind, content, source
  `;
  return (rows[0] as Memory) || null;
}

/**
 * Format memories into a compact section for inclusion in the chat system prompt.
 * Returns empty string if there are none, so the system prompt stays clean
 * for first-time use.
 */
export function memoriesForPrompt(memories: Memory[]): string {
  if (memories.length === 0) return '';

  const loves = memories.filter((m) => m.kind === 'love');
  const avoids = memories.filter((m) => m.kind === 'avoid');
  const context = memories.filter((m) => m.kind === 'context');

  const sections: string[] = ['', 'Things the household has told you to remember:'];

  if (loves.length) {
    sections.push('');
    sections.push('Loved / favourites:');
    for (const m of loves) sections.push(`- ${m.content}`);
  }
  if (avoids.length) {
    sections.push('');
    sections.push('Avoid / disliked:');
    for (const m of avoids) sections.push(`- ${m.content}`);
  }
  if (context.length) {
    sections.push('');
    sections.push('Other context:');
    for (const m of context) sections.push(`- ${m.content}`);
  }

  sections.push('');
  sections.push(
    'Use these naturally to inform suggestions. Do not list them back unless asked. ' +
      'If the user mentions a new clear preference (loved/disliked something specific, ' +
      'a useful piece of context), call the remember_meal tool to save it.'
  );

  return sections.join('\n');
}
