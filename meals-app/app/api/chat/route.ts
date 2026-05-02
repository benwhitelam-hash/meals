import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import { AUTH_COOKIE_NAME, verifySession } from '@/lib/auth';
import {
  listMemories,
  memoriesForPrompt,
  createMemory,
  deleteMemory,
  type Memory,
  type MemoryKind,
} from '@/lib/memory';
import { ALL_TOOLS } from '@/lib/tools';
import { extractAndSave } from '@/lib/extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHAT_MODEL = 'claude-sonnet-4-6';

interface Preferences {
  household?: string;
  dietary?: string;
  dislikes?: string;
  cuisines?: string;
  equipment?: string;
  notes?: string;
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Public-facing record of an action the chat performed (e.g. saved a memory).
 * Returned to the client so the UI can show "💾 Remembered: …" indicators.
 */
interface MemoryAction {
  type: 'remembered' | 'forgot';
  memory?: Memory;
  id?: string;
}

function buildSystemPrompt(prefs: Preferences = {}, memories: Memory[]): string {
  const parts: string[] = [
    "You are the household's personal meal-planning assistant. You help with recipe ideas, weekly meal plans, shopping lists, and answering cooking questions.",
    '',
    'Style:',
    '- Be warm and practical. Talk like a trusted friend who happens to cook a lot, not a chatbot.',
    '- Default to concise answers. If asked for a recipe, give clear numbered steps with prep time and a short ingredients list at the top.',
    '- For meal ideas, suggest 3-5 options with a one-line pitch each. Ask before going deeper unless the user has been specific.',
    '- Use British English (courgette, aubergine, coriander) and metric/imperial as appropriate for UK cooking.',
    '- If a request conflicts with the household preferences below, gently flag it.',
    '',
    'Household context:',
    `- ${prefs.household?.trim() || 'A household of 2 adults, in the UK.'}`,
  ];
  if (prefs.dietary?.trim()) parts.push(`- Dietary requirements: ${prefs.dietary.trim()}`);
  if (prefs.dislikes?.trim()) parts.push(`- Dislikes / avoid: ${prefs.dislikes.trim()}`);
  if (prefs.cuisines?.trim()) parts.push(`- Cuisines they enjoy: ${prefs.cuisines.trim()}`);
  if (prefs.equipment?.trim()) parts.push(`- Kitchen equipment available: ${prefs.equipment.trim()}`);
  if (prefs.notes?.trim()) parts.push(`- Other notes: ${prefs.notes.trim()}`);

  // Append memory section
  parts.push(memoriesForPrompt(memories));

  // If memories exist, surface their IDs so forget_meal can target them
  if (memories.length) {
    parts.push('Memory IDs (only used for the forget_meal tool):');
    for (const m of memories) parts.push(`- ${m.id}: ${m.content}`);
  }

  return parts.join('\n');
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  // Identify the user for memory attribution
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const username = session.username;

  let body: { messages?: IncomingMessage[]; preferences?: Preferences };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { messages: incomingMessages, preferences } = body;
  if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 });
  }

  // Load current memories for prompt + tool context
  let memories: Memory[] = [];
  try {
    memories = await listMemories();
  } catch (e) {
    console.error('[chat] could not load memories:', e);
    // Don't fail the chat — degrade gracefully without memories
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt(preferences, memories);

  // Build the running message array. We mutate this across tool-use rounds.
  const apiMessages: Anthropic.MessageParam[] = incomingMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const memoryActions: MemoryAction[] = [];
  let assistantText = '';

  try {
    // Tool-use loop. Cap iterations defensively.
    for (let round = 0; round < 5; round++) {
      const response: Anthropic.Message = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: ALL_TOOLS,
        messages: apiMessages,
      });

      // Collect text from this turn
      const turnText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (turnText) assistantText = turnText;

      if (response.stop_reason !== 'tool_use') break;

      // Run all tool calls from this turn
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tu of toolUses) {
        let resultText: string;
        let isError = false;

        if (tu.name === 'remember_meal') {
          const input = tu.input as { kind?: MemoryKind; content?: string };
          if (
            !input.kind ||
            !['love', 'avoid', 'context'].includes(input.kind) ||
            !input.content?.trim()
          ) {
            resultText = 'error: invalid arguments';
            isError = true;
          } else {
            try {
              const newMemory = await createMemory({
                created_by: username,
                kind: input.kind,
                content: input.content.trim(),
                source: 'explicit',
              });
              memoryActions.push({ type: 'remembered', memory: newMemory });
              resultText = `Saved memory ${newMemory.id}: [${newMemory.kind}] ${newMemory.content}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error saving: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'forget_meal') {
          const input = tu.input as { id?: string };
          if (!input.id) {
            resultText = 'error: id required';
            isError = true;
          } else {
            try {
              const ok = await deleteMemory(input.id);
              if (ok) {
                memoryActions.push({ type: 'forgot', id: input.id });
                resultText = `Deleted memory ${input.id}`;
              } else {
                resultText = 'error: memory not found';
                isError = true;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error deleting: ${msg}`;
              isError = true;
            }
          }
        } else {
          resultText = `error: unknown tool ${tu.name}`;
          isError = true;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: resultText,
          is_error: isError,
        });
      }

      // Append the assistant's tool_use turn AND our tool_result turn
      apiMessages.push({ role: 'assistant', content: response.content });
      apiMessages.push({ role: 'user', content: toolResults });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[chat] anthropic error:', message);
    return NextResponse.json(
      { error: 'Chat failed', detail: message },
      { status: 500 }
    );
  }

  // Schedule background extraction AFTER the response is sent
  after(async () => {
    try {
      const fullTranscript: IncomingMessage[] = [
        ...incomingMessages,
        { role: 'assistant', content: assistantText },
      ];
      await extractAndSave(fullTranscript, username);
    } catch (e) {
      console.error('[chat] background extraction failed:', e);
    }
  });

  return NextResponse.json({
    content: assistantText,
    memoryActions,
  });
}
