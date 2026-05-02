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
import {
  listRecipes,
  recipesForPrompt,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  type Recipe,
} from '@/lib/recipes';
import {
  getPlan,
  setPlan,
  setEntry,
  clearEntry,
  planForPrompt,
  mondayOf,
  shiftWeeks,
  type DayCode,
  type EntryKind,
  type MealPlan,
  type PlanEntry,
  ALL_DAYS,
} from '@/lib/plans';
import { ALL_TOOLS } from '@/lib/tools';
import { extractAndSave, extractIngredients } from '@/lib/extract';

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
 * Public-facing record of an action the chat performed (e.g. saved a memory or recipe).
 * Returned to the client so the UI can show inline indicators.
 */
interface ChatAction {
  type:
    | 'remembered'
    | 'forgot'
    | 'recipe_saved'
    | 'recipe_updated'
    | 'recipe_deleted'
    | 'plan_set'
    | 'plan_entry_set'
    | 'plan_entry_cleared';
  memory?: Memory;
  recipe?: Recipe;
  plan?: MealPlan;
  week_start?: string;
  day?: DayCode;
  id?: string;
}

function buildSystemPrompt(
  prefs: Preferences = {},
  memories: Memory[],
  recipes: Recipe[],
  thisWeekStart: string,
  thisWeekPlan: MealPlan | null,
  nextWeekStart: string,
  nextWeekPlan: MealPlan | null
): string {
  // Today as a long-form English date
  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Recipe id -> name lookup for the plan formatter
  const recipeNames: Record<string, string> = {};
  for (const r of recipes) recipeNames[r.id] = r.name;

  const parts: string[] = [
    "You are the household's personal meal-planning assistant. You help with recipe ideas, weekly meal plans, shopping lists, and answering cooking questions.",
    '',
    'Style:',
    '- Be warm and practical. Talk like a trusted friend who happens to cook a lot, not a chatbot.',
    '- Default to concise answers. If asked for a recipe, give clear numbered steps with prep time and a short ingredients list at the top.',
    '- For meal ideas, suggest 3-5 options with a one-line pitch each. Ask before going deeper unless the user has been specific.',
    '- Use British English (courgette, aubergine, coriander) and metric/imperial as appropriate for UK cooking.',
    '- If a request conflicts with the household preferences below, gently flag it.',
    "- When suggesting meals, prefer recipes from the saved collection if any fit — they're trusted favourites.",
    '- When the user asks to plan the week, use propose_meal_plan. When they want to swap a single day, use set_meal_plan_entry. When they\'re out a day, use clear_meal_plan_entry.',
    '',
    'Date context:',
    `- Today is ${todayLabel}.`,
    `- This week (Mon-Sun) starts: ${thisWeekStart}.`,
    `- Next week starts: ${nextWeekStart}.`,
    '- When tools need a week_start, pass one of those ISO dates exactly.',
    '',
    'Household context:',
    `- ${prefs.household?.trim() || 'A household of 2 adults, in the UK.'}`,
  ];
  if (prefs.dietary?.trim()) parts.push(`- Dietary requirements: ${prefs.dietary.trim()}`);
  if (prefs.dislikes?.trim()) parts.push(`- Dislikes / avoid: ${prefs.dislikes.trim()}`);
  if (prefs.cuisines?.trim()) parts.push(`- Cuisines they enjoy: ${prefs.cuisines.trim()}`);
  if (prefs.equipment?.trim()) parts.push(`- Kitchen equipment available: ${prefs.equipment.trim()}`);
  if (prefs.notes?.trim()) parts.push(`- Other notes: ${prefs.notes.trim()}`);

  // Memories
  parts.push(memoriesForPrompt(memories));
  if (memories.length) {
    parts.push('Memory IDs (only used for the forget_meal tool):');
    for (const m of memories) parts.push(`- ${m.id}: ${m.content}`);
  }

  // Recipes (full bodies)
  parts.push(recipesForPrompt(recipes));

  // Current and next week's plans
  parts.push('');
  parts.push('## Current meal plans');
  parts.push('');
  parts.push(planForPrompt(thisWeekPlan, thisWeekStart, recipeNames));
  parts.push('');
  parts.push(planForPrompt(nextWeekPlan, nextWeekStart, recipeNames));

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

  // Load current memories, recipes, and plans for prompt + tool context
  const thisWeekStart = mondayOf();
  const nextWeekStart = shiftWeeks(thisWeekStart, 1);

  let memories: Memory[] = [];
  let recipes: Recipe[] = [];
  let thisWeekPlan: MealPlan | null = null;
  let nextWeekPlan: MealPlan | null = null;
  try {
    [memories, recipes, thisWeekPlan, nextWeekPlan] = await Promise.all([
      listMemories(),
      listRecipes(),
      getPlan(thisWeekStart),
      getPlan(nextWeekStart),
    ]);
  } catch (e) {
    console.error('[chat] could not load context:', e);
    // Don't fail the chat — degrade gracefully
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt(
    preferences,
    memories,
    recipes,
    thisWeekStart,
    thisWeekPlan,
    nextWeekStart,
    nextWeekPlan
  );

  // Build the running message array. We mutate this across tool-use rounds.
  const apiMessages: Anthropic.MessageParam[] = incomingMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const chatActions: ChatAction[] = [];
  // Recipes saved this turn — used for ingredient extraction in after()
  const recipesSavedThisTurn: { id: string; name: string; body: string }[] = [];
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
              chatActions.push({ type: 'remembered', memory: newMemory });
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
                chatActions.push({ type: 'forgot', id: input.id });
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
        } else if (tu.name === 'save_recipe') {
          const input = tu.input as { name?: string; body_md?: string };
          if (!input.name?.trim() || !input.body_md?.trim()) {
            resultText = 'error: name and body_md required';
            isError = true;
          } else {
            try {
              const newRecipe = await createRecipe({
                created_by: username,
                name: input.name.trim(),
                body_md: input.body_md.trim(),
              });
              chatActions.push({ type: 'recipe_saved', recipe: newRecipe });
              recipesSavedThisTurn.push({
                id: newRecipe.id,
                name: newRecipe.name,
                body: newRecipe.body_md,
              });
              resultText = `Saved recipe ${newRecipe.id}: "${newRecipe.name}"`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error saving recipe: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'update_recipe') {
          const input = tu.input as { id?: string; name?: string; body_md?: string };
          if (!input.id) {
            resultText = 'error: id required';
            isError = true;
          } else {
            try {
              const updated = await updateRecipe(input.id, {
                ...(input.name ? { name: input.name } : {}),
                ...(input.body_md ? { body_md: input.body_md } : {}),
              });
              if (!updated) {
                resultText = 'error: recipe not found';
                isError = true;
              } else {
                chatActions.push({ type: 'recipe_updated', recipe: updated });
                // If body changed, re-extract ingredients in background
                if (input.body_md) {
                  recipesSavedThisTurn.push({
                    id: updated.id,
                    name: updated.name,
                    body: updated.body_md,
                  });
                }
                resultText = `Updated recipe ${updated.id}: "${updated.name}"`;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error updating recipe: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'delete_recipe') {
          const input = tu.input as { id?: string };
          if (!input.id) {
            resultText = 'error: id required';
            isError = true;
          } else {
            try {
              const ok = await deleteRecipe(input.id);
              if (ok) {
                chatActions.push({ type: 'recipe_deleted', id: input.id });
                resultText = `Deleted recipe ${input.id}`;
              } else {
                resultText = 'error: recipe not found';
                isError = true;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error deleting recipe: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'propose_meal_plan') {
          const input = tu.input as { week_start?: string; entries?: PlanEntry[] };
          if (!input.week_start || !Array.isArray(input.entries)) {
            resultText = 'error: week_start and entries required';
            isError = true;
          } else {
            try {
              const plan = await setPlan(input.week_start, input.entries, username);
              chatActions.push({
                type: 'plan_set',
                plan,
                week_start: input.week_start,
              });
              resultText = `Saved plan for week starting ${input.week_start} with ${plan.entries.length} entries`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error saving plan: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'set_meal_plan_entry') {
          const input = tu.input as {
            week_start?: string;
            day?: DayCode;
            kind?: EntryKind;
            recipe_id?: string;
            text?: string;
            notes?: string;
          };
          if (
            !input.week_start ||
            !input.day ||
            !ALL_DAYS.includes(input.day) ||
            !input.kind
          ) {
            resultText = 'error: week_start, day, and kind required';
            isError = true;
          } else if (input.kind === 'recipe' && !input.recipe_id) {
            resultText = 'error: recipe_id required when kind=recipe';
            isError = true;
          } else if (input.kind === 'freetext' && !input.text?.trim()) {
            resultText = 'error: text required when kind=freetext';
            isError = true;
          } else {
            try {
              const plan = await setEntry(
                input.week_start,
                input.day,
                {
                  kind: input.kind,
                  ...(input.recipe_id ? { recipe_id: input.recipe_id } : {}),
                  ...(input.text ? { text: input.text.trim() } : {}),
                  ...(input.notes ? { notes: input.notes.trim() } : {}),
                },
                username
              );
              chatActions.push({
                type: 'plan_entry_set',
                plan,
                week_start: input.week_start,
                day: input.day,
              });
              resultText = `Set ${input.day} on week ${input.week_start}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error setting entry: ${msg}`;
              isError = true;
            }
          }
        } else if (tu.name === 'clear_meal_plan_entry') {
          const input = tu.input as { week_start?: string; day?: DayCode };
          if (
            !input.week_start ||
            !input.day ||
            !ALL_DAYS.includes(input.day)
          ) {
            resultText = 'error: week_start and day required';
            isError = true;
          } else {
            try {
              const plan = await clearEntry(input.week_start, input.day, username);
              chatActions.push({
                type: 'plan_entry_cleared',
                plan,
                week_start: input.week_start,
                day: input.day,
              });
              resultText = `Cleared ${input.day} on week ${input.week_start}`;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'unknown';
              resultText = `error clearing entry: ${msg}`;
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

  // Schedule background work AFTER the response is sent:
  //   1. Extract any new household preferences from the transcript
  //   2. Extract structured ingredients for any recipes saved this turn
  after(async () => {
    try {
      const fullTranscript: IncomingMessage[] = [
        ...incomingMessages,
        { role: 'assistant', content: assistantText },
      ];
      await extractAndSave(fullTranscript, username);
    } catch (e) {
      console.error('[chat] background memory extraction failed:', e);
    }

    for (const r of recipesSavedThisTurn) {
      try {
        const ingredients = await extractIngredients(r.name, r.body);
        if (ingredients.length > 0) {
          await updateRecipe(r.id, { ingredients });
          console.log(`[chat] extracted ${ingredients.length} ingredients for ${r.name}`);
        }
      } catch (e) {
        console.error(`[chat] ingredient extraction failed for ${r.id}:`, e);
      }
    }
  });

  return NextResponse.json({
    content: assistantText,
    chatActions,
  });
}
