/**
 * Background extraction: after each chat exchange, ask Haiku to scan the
 * transcript for any new household preferences worth remembering that
 * the explicit `remember_meal` tool didn't already capture.
 *
 * Designed to be dedupe-aware (we pass current memories so it can skip duplicates)
 * and bias toward NOT saving when uncertain (precision over recall).
 */

import Anthropic from '@anthropic-ai/sdk';
import { listMemories, createMemory, type MemoryKind } from './memory';

interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ExtractedFact {
  kind: MemoryKind;
  content: string;
}

const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a precision filter that extracts NEW lasting household food preferences from a chat transcript.

Output ONLY a JSON array of objects with shape: {"kind": "love"|"avoid"|"context", "content": "..."}
- "love" = a meal/ingredient/cuisine they clearly enjoyed and would have again
- "avoid" = something they clearly disliked or won't eat
- "context" = lasting facts: dietary needs, equipment, schedule patterns, household composition

Hard rules — bias toward returning [] (empty array):
1. Only extract if the preference is clearly stated by the user (not assistant). Don't extract from assistant suggestions.
2. Only extract LASTING preferences. Don't extract one-off requests like "let's have pasta tonight".
3. Skip anything already covered by the existing memories provided.
4. Skip anything ambiguous, hypothetical, or expressed as a question.
5. If nothing clear emerges, output [].
6. content should be a short, third-person fact written like a memory (e.g. "Loved Thai green curry as a weeknight dinner").

Output JSON only — no preamble, no explanation, no markdown code fences.`;

export async function extractAndSave(
  transcript: TranscriptMessage[],
  createdBy: string
): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;

  // Use the last few turns only — older context is already in memory or stale
  const recent = transcript.slice(-6);
  const transcriptText = recent
    .map((m) => `${m.role === 'user' ? createdBy : 'kitchen'}: ${m.content}`)
    .join('\n\n');

  const existing = await listMemories();
  const existingText =
    existing.length > 0
      ? existing.map((m) => `- [${m.kind}] ${m.content}`).join('\n')
      : '(none yet)';

  const userPrompt = `Existing memories (skip duplicates of these):
${existingText}

Recent transcript:
${transcriptText}

Extract new lasting preferences as JSON array, or [] if none.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (e) {
    console.error('[extract] Anthropic call failed:', e);
    return 0;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // Strip markdown fences if present, despite the instruction
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

  let facts: ExtractedFact[];
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return 0;
    facts = parsed.filter(
      (f): f is ExtractedFact =>
        f &&
        typeof f.content === 'string' &&
        f.content.trim().length > 0 &&
        ['love', 'avoid', 'context'].includes(f.kind)
    );
  } catch {
    console.error('[extract] could not parse JSON:', text);
    return 0;
  }

  let saved = 0;
  for (const f of facts) {
    try {
      await createMemory({
        created_by: createdBy,
        kind: f.kind,
        content: f.content.trim(),
        source: 'extracted',
      });
      saved++;
    } catch (e) {
      console.error('[extract] insert failed for', f, e);
    }
  }

  if (saved > 0) console.log(`[extract] saved ${saved} memory/memories`);
  return saved;
}
