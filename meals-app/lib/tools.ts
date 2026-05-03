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

// =================================================================
// Meal plan tools
// =================================================================

const DAY_ENUM = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const PROPOSE_MEAL_PLAN_TOOL: Anthropic.Tool = {
  name: 'propose_meal_plan',
  description:
    "Set the household's dinners for an entire week. REPLACES any existing plan for that week. " +
    "Use when the user asks for a week's plan or to redo the week. " +
    'Each entry is either a saved recipe (use recipe_id from the system prompt) or free text ' +
    "(e.g. 'takeaway', 'leftovers', 'out for dinner'). Days that should be empty can be omitted from entries. " +
    "After saving, briefly summarise what's planned for the week.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
        description:
          "ISO date YYYY-MM-DD of the Monday of the target week. The system prompt provides the current week's Monday date.",
      },
      entries: {
        type: 'array',
        description: 'List of meal entries for the week. Days not listed will be empty.',
        items: {
          type: 'object',
          properties: {
            day: {
              type: 'string',
              enum: [...DAY_ENUM],
              description: 'Three-letter day code: mon, tue, wed, thu, fri, sat, sun',
            },
            kind: {
              type: 'string',
              enum: ['recipe', 'freetext'],
              description:
                "'recipe' to use a saved recipe, 'freetext' for ad-hoc entries like 'takeaway'",
            },
            recipe_id: {
              type: 'string',
              description: 'Required if kind=recipe. UUID from the system prompt.',
            },
            text: {
              type: 'string',
              description:
                "Required if kind=freetext. Short label like 'takeaway' or 'leftovers'.",
            },
            notes: {
              type: 'string',
              description: "Optional extra note like 'double the rice' or 'eating late'.",
            },
          },
          required: ['day', 'kind'],
        },
      },
    },
    required: ['week_start', 'entries'],
  },
};

export const SET_MEAL_PLAN_ENTRY_TOOL: Anthropic.Tool = {
  name: 'set_meal_plan_entry',
  description:
    'Set or replace a single day in a week. Use when the user wants to change just one day, ' +
    "e.g. 'put the tray bake on Wednesday' or 'Friday is takeaway'. Does NOT touch other days.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD of the Monday of the target week.',
      },
      day: {
        type: 'string',
        enum: [...DAY_ENUM],
      },
      kind: {
        type: 'string',
        enum: ['recipe', 'freetext'],
      },
      recipe_id: {
        type: 'string',
        description: 'Required if kind=recipe.',
      },
      text: {
        type: 'string',
        description: 'Required if kind=freetext.',
      },
      notes: {
        type: 'string',
      },
    },
    required: ['week_start', 'day', 'kind'],
  },
};

export const CLEAR_MEAL_PLAN_ENTRY_TOOL: Anthropic.Tool = {
  name: 'clear_meal_plan_entry',
  description:
    "Empty a single day in the plan. Use when the user says they're not eating in that day, " +
    "e.g. 'we're out Friday'.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
      },
      day: {
        type: 'string',
        enum: [...DAY_ENUM],
      },
    },
    required: ['week_start', 'day'],
  },
};

export const SET_PLAN_ACTIVITY_TOOL: Anthropic.Tool = {
  name: 'set_plan_activity',
  description:
    "Note an evening activity for a particular day in the plan, e.g. 'Tuesday: book club at 8pm', " +
    "'Thursday: gym, want something quick'. Activities sit alongside meals and help with planning " +
    "(early dinners, leftovers, takeaway days). REPLACES any existing activity on that day. " +
    "Use only for things happening in the evening that affect dinner planning — don't capture " +
    "general daytime events.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD of the Monday of the target week.',
      },
      day: {
        type: 'string',
        enum: [...DAY_ENUM],
      },
      text: {
        type: 'string',
        description:
          "Short activity description (e.g. 'book club', 'gym 6pm', 'late meeting'). Keep concise.",
      },
      notes: {
        type: 'string',
        description: "Optional extra context, e.g. 'eating before' or 'need 30min meal'.",
      },
    },
    required: ['week_start', 'day', 'text'],
  },
};

export const CLEAR_PLAN_ACTIVITY_TOOL: Anthropic.Tool = {
  name: 'clear_plan_activity',
  description:
    "Remove the activity note from a single day. Use when the user says an activity is cancelled " +
    "or no longer relevant.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
      },
      day: {
        type: 'string',
        enum: [...DAY_ENUM],
      },
    },
    required: ['week_start', 'day'],
  },
};

export const SET_MEAL_PREP_AHEAD_TOOL: Anthropic.Tool = {
  name: 'set_meal_prep_ahead',
  description:
    "Flag that the meal on a given day needs prep done ahead of time (the day before by default). " +
    "Use when a planned meal genuinely needs lead time — e.g. soaking pulses overnight, marinating, " +
    "defrosting from the freezer, sourdough starter, slow-cooker prep, taking meat out the night before. " +
    "Especially useful when a busy evening means dinner has to be quick — flag prep on the previous, calmer day. " +
    "Only call when there's already a meal entry on that day; the prep flag attaches to it. " +
    "REPLACES any existing prep flag on that day. Keep `text` short and action-oriented.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD of the Monday of the target week.',
      },
      day: {
        type: 'string',
        enum: [...DAY_ENUM],
        description: 'The day the MEAL is for (not the prep day). Prep is shown on the day before.',
      },
      text: {
        type: 'string',
        description:
          "Short imperative reminder. E.g. 'Take chicken out of freezer', 'Soak chickpeas overnight', " +
          "'Marinate the lamb', 'Start the sourdough'. Keep under 12 words.",
      },
      days_before: {
        type: 'integer',
        description:
          'How many days before the meal the prep should happen. Default 1 (i.e. the night before). ' +
          'Use 2 for things like sourdough or slow-marinades. Range 1-3.',
        minimum: 1,
        maximum: 3,
      },
    },
    required: ['week_start', 'day', 'text'],
  },
};

export const CLEAR_MEAL_PREP_AHEAD_TOOL: Anthropic.Tool = {
  name: 'clear_meal_prep_ahead',
  description:
    "Remove the prep-ahead flag from a meal entry. The meal itself stays — only the prep reminder is cleared.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: { type: 'string' },
      day: { type: 'string', enum: [...DAY_ENUM] },
    },
    required: ['week_start', 'day'],
  },
};

// =================================================================
// Feedback tool — captures feature ideas / UX suggestions
// =================================================================

export const SUBMIT_FEEDBACK_TOOL: Anthropic.Tool = {
  name: 'submit_feedback',
  description:
    "Capture a feature idea, UX improvement, or bug report from the user about the app itself " +
    "(NOT a household preference about food — those go to remember_meal). Trigger when the user says " +
    "things like 'it'd be useful if...', 'I wish I could...', 'this would be better if...', " +
    "'I noticed a bug where...', or 'add a feature to...'. " +
    "These are stored centrally and viewable on the /feedback page. " +
    "Confirm capture briefly to the user (e.g. 'Noted — saved that as an idea.') and don't follow up unless asked. " +
    "Infer the area from context; ask the user if genuinely ambiguous.",
  input_schema: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description:
          "The idea or feedback in a clear, self-contained sentence or two. Rewrite the user's words " +
          "into something that will make sense out of context — someone reading the /feedback page later " +
          "shouldn't need the surrounding chat to understand. Preserve the user's intent and tone.",
      },
      area: {
        type: 'string',
        enum: ['meals', 'recipes', 'plan', 'shopping', 'general'],
        description:
          "Which part of the app the feedback relates to. " +
          "'meals' = the chat itself. 'recipes' = the recipe collection page. " +
          "'plan' = the week planner. 'shopping' = the shopping list. " +
          "'general' = cross-cutting / unsure / outside the meals app.",
      },
    },
    required: ['content', 'area'],
  },
};

// =================================================================
// Shopping list tools
// =================================================================

export const GENERATE_SHOPPING_LIST_TOOL: Anthropic.Tool = {
  name: 'generate_shopping_list',
  description:
    "Build a shopping list from the meal plan for a given week. Pulls ingredients from each " +
    "saved recipe in the plan, dedupes them, and categorises them by supermarket aisle. " +
    "APPENDS to the current open list (preserves any items the user has already added manually). " +
    "If no list exists, creates one. Use when the user asks for a shopping list. " +
    "After running, briefly summarise how many items were added.",
  input_schema: {
    type: 'object' as const,
    properties: {
      week_start: {
        type: 'string',
        description:
          "ISO date YYYY-MM-DD of the Monday of the target week. Use the current week's Monday from the system prompt unless the user specifies otherwise.",
      },
    },
    required: ['week_start'],
  },
};

export const ADD_TO_SHOPPING_LIST_TOOL: Anthropic.Tool = {
  name: 'add_to_shopping_list',
  description:
    "Add one or more items to the current open shopping list (or create a list if none exists). " +
    "Use when the user wants to add things mid-week, like 'add bin bags and washing tabs to the list'. " +
    "Items get auto-categorised; you don't need to specify a category.",
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        description: 'List of item names to add.',
        items: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The item name as it should appear on the list (e.g. "milk", "bin bags").',
            },
          },
          required: ['content'],
        },
      },
    },
    required: ['items'],
  },
};

export const COMPLETE_SHOPPING_LIST_TOOL: Anthropic.Tool = {
  name: 'complete_shopping_list',
  description:
    "Mark the current open shopping list as done (i.e. the user has been shopping). " +
    "After this, the next generate or add will start a fresh list. Use when the user says " +
    "they've finished shopping or wants to start fresh.",
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
};

export const ALL_TOOLS = [
  REMEMBER_MEAL_TOOL,
  FORGET_MEAL_TOOL,
  SAVE_RECIPE_TOOL,
  UPDATE_RECIPE_TOOL,
  DELETE_RECIPE_TOOL,
  PROPOSE_MEAL_PLAN_TOOL,
  SET_MEAL_PLAN_ENTRY_TOOL,
  CLEAR_MEAL_PLAN_ENTRY_TOOL,
  SET_PLAN_ACTIVITY_TOOL,
  CLEAR_PLAN_ACTIVITY_TOOL,
  SET_MEAL_PREP_AHEAD_TOOL,
  CLEAR_MEAL_PREP_AHEAD_TOOL,
  GENERATE_SHOPPING_LIST_TOOL,
  ADD_TO_SHOPPING_LIST_TOOL,
  COMPLETE_SHOPPING_LIST_TOOL,
  SUBMIT_FEEDBACK_TOOL,
];
