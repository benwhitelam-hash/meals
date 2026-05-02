/**
 * Tool definitions exposed to Claude in the chat route.
 * Keep these tightly scoped — small surface area, clear schemas.
 */

import type Anthropic from '@anthropic-ai/sdk';

export const REMEMBER_MEAL_TOOL: Anthropic.Tool = {
  name: 'remember_meal',
  description:
    "Save a household preference, taste, or piece of context that should be remembered " +
    'across future conversations. Call this when the user clearly tells you about a ' +
    'meal/ingredient/cuisine they liked or disliked, a dietary need, kitchen equipment, ' +
    'or any other lasting fact about the household. Do NOT call this for one-off requests ' +
    "or things that won't be relevant tomorrow (e.g. 'we want pasta tonight').",
  input_schema: {
    type: 'object' as const,
    properties: {
      kind: {
        type: 'string',
        enum: ['love', 'avoid', 'context'],
        description:
          "'love' for things they enjoyed and want again, " +
          "'avoid' for things they didn't enjoy or won't eat, " +
          "'context' for anything else worth remembering (equipment, schedule, dietary etc.)",
      },
      content: {
        type: 'string',
        description:
          'Short factual statement, written in third person. ' +
          'Good: "Loved the Thai green curry — wants it again as a weeknight option". ' +
          'Bad: "you said you loved the curry".',
      },
    },
    required: ['kind', 'content'],
  },
};

export const FORGET_MEAL_TOOL: Anthropic.Tool = {
  name: 'forget_meal',
  description:
    'Remove a previously saved memory. Use only when the user explicitly asks to forget ' +
    'something or corrects a memory. Provide the memory id from the system prompt context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the memory to remove.',
      },
    },
    required: ['id'],
  },
};

export const ALL_TOOLS = [REMEMBER_MEAL_TOOL, FORGET_MEAL_TOOL];
