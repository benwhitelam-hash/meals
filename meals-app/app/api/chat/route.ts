import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

function buildSystemPrompt(prefs: Preferences = {}): string {
  const sections: string[] = [
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
  ];

  sections.push(`- ${prefs.household?.trim() || 'A household of 2 adults, in the UK.'}`);
  if (prefs.dietary?.trim()) sections.push(`- Dietary requirements: ${prefs.dietary.trim()}`);
  if (prefs.dislikes?.trim()) sections.push(`- Dislikes / avoid: ${prefs.dislikes.trim()}`);
  if (prefs.cuisines?.trim()) sections.push(`- Cuisines they enjoy: ${prefs.cuisines.trim()}`);
  if (prefs.equipment?.trim()) sections.push(`- Kitchen equipment available: ${prefs.equipment.trim()}`);
  if (prefs.notes?.trim()) sections.push(`- Other notes: ${prefs.notes.trim()}`);

  return sections.join('\n');
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  let body: { messages?: IncomingMessage[]; preferences?: Preferences };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { messages, preferences } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(preferences),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return NextResponse.json({ content: text });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('Anthropic API error:', message);
    return NextResponse.json({ error: 'Chat failed', detail: message }, { status: 500 });
  }
}
