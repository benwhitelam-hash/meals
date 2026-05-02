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

// =================================================================
// Recipe tools
// =================================================================

export const SAVE_RECIPE_TOOL: Anthropic.Tool = {
  name: 'save_recipe',
  description:
    'Save a new recipe to the household collection. Call this when the user describes ' +
    'a dish they want to remember — even loosely. Preserve their voice and informal ' +
    "wording in the body — don't sanitise or over-structure. The body is markdown; you " +
    "may use ## headings for 'Ingredients' and 'Method' if it improves readability, " +
    'but only if the user supplied that level of detail. Short and casual is fine.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description:
          'A short, recognisable name for the recipe — what the user calls it day-to-day. ' +
          'E.g. "Friday tray bake", "Mum\'s chilli", "The chicken thing". Title case but informal.',
      },
      body_md: {
        type: 'string',
        description:
          'The recipe body, in markdown. Include ingredients (with quantities if known) ' +
          'and method. Keep the user\'s voice. If they mentioned timing, equipment, or tips, ' +
          'include those too.',
      },
    },
    required: ['name', 'body_md'],
  },
};

export const UPDATE_RECIPE_TOOL: Anthropic.Tool = {
  name: 'update_recipe',
  description:
    'Edit an existing recipe. Use when the user wants to tweak, correct, or extend a recipe ' +
    'they previously saved (e.g. "I do it with paprika now"). You can update name, body, or both. ' +
    'Provide the recipe id from the system prompt context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the recipe to update.',
      },
      name: {
        type: 'string',
        description: 'New name. Omit if not changing.',
      },
      body_md: {
        type: 'string',
        description:
          'New full body in markdown. Omit if not changing. Note: this REPLACES the body, ' +
          "so include the bits you want to keep too — don't just send the diff.",
      },
    },
    required: ['id'],
  },
};

export const DELETE_RECIPE_TOOL: Anthropic.Tool = {
  name: 'delete_recipe',
  description:
    'Delete a saved recipe. Use only when the user clearly wants it removed (not just "I never make this anymore"). ' +
    'Confirm tentatively in the response — the deletion is permanent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'The UUID of the recipe to delete.',
      },
    },
    required: ['id'],
  },
};

export const ALL_TOOLS = [
  REMEMBER_MEAL_TOOL,
  FORGET_MEAL_TOOL,
  SAVE_RECIPE_TOOL,
  UPDATE_RECIPE_TOOL,
  DELETE_RECIPE_TOOL,
];
