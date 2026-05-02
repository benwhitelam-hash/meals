# Meals — Pink Crocodile

A small private meal-planning app for Ben & Jenny.
Lives at **meals.pinkcrocodile.dev**, gated by personal login,
backed by Anthropic's Claude API, with persistent household memory in Postgres.

---

## What's in here

- **Next.js 15 (App Router)** with React 19
- **Edge middleware** that gates every route behind a session cookie
- **JWT sessions** signed with a server-side secret (using `jose`, Edge-compatible)
- **Cross-subdomain SSO** — cookie scoped to `.pinkcrocodile.dev` so logging
  in here also signs you into other future pinkcrocodile.dev apps
- **Chat UI** with auto-resizing composer and household preferences
- **Server-side Anthropic API proxy** (`/api/chat`) — API key never exposed to the browser
- **Persistent household memory** — Postgres-backed, populated by both:
  - Explicit tool calls during chat (`remember_meal` / `forget_meal`)
  - Automatic background extraction by Haiku 4.5 after each exchange
- **Editorial-kitchen aesthetic** — Fraunces serif + Geist, paper cream, rhubarb pink

```
meals-app/
├── app/
│   ├── api/
│   │   ├── auth/login         # POST credentials, set session cookie
│   │   ├── auth/logout        # POST to clear cookie
│   │   ├── chat               # POST messages — handles tool use + after() extraction
│   │   ├── me                 # GET current username
│   │   ├── memories           # GET list, POST create
│   │   └── memories/[id]      # PATCH update, DELETE remove
│   ├── login/page.tsx         # Login page
│   ├── page.tsx               # The chat UI + memory drawer
│   ├── croc.tsx               # Crocodile mark
│   ├── globals.css            # All styles
│   └── layout.tsx
├── lib/
│   ├── auth.ts                # Auth helpers (JWT, cookies, validation)
│   ├── db.ts                  # Neon serverless connection
│   ├── memory.ts              # Memory CRUD + prompt formatter
│   ├── tools.ts               # Anthropic tool definitions
│   └── extract.ts             # Background memory extraction (Haiku)
├── db/
│   └── schema.sql             # One-time DB migration (run in Neon SQL editor)
├── middleware.ts              # Gates every route except /login
└── .env.example
```

---

## Architecture: how memory works

Every chat request:

1. Loads all current memories from Postgres
2. Injects them into the system prompt (formatted as Loved/Avoided/Context lists)
3. Calls Sonnet 4.6 with two tools available: `remember_meal` and `forget_meal`
4. If Claude calls a tool, the route executes it (DB insert/delete) and loops
5. Returns the final text + a list of memory actions to the client
6. **After the response is sent**, fires a background Haiku 4.5 call (via `after()`)
   that scans the transcript for any other lasting preferences worth remembering

Two paths feed the same `meal_memories` table:
- `source='explicit'` — saved via the `remember_meal` tool, immediate, in-chat
- `source='extracted'` — saved by background Haiku extraction, ~2s after response

Both are visible/editable/deletable in the Memories drawer.

---

## Required environment variables

| Variable | What it is | Set by |
|---|---|---|
| `AUTH_USERS_JSON` | JSON array: `[{"username":"Ben","password":"..."},{"username":"Jenny","password":"..."}]` | You manually |
| `AUTH_SECRET` | Long random string (≥32 chars) for signing session JWTs | You manually |
| `COOKIE_DOMAIN` | `.pinkcrocodile.dev` (with leading dot) in production for SSO | You manually |
| `ANTHROPIC_API_KEY` | Claude API key | You manually |
| `DATABASE_URL` | Postgres connection string | Auto-injected by Neon-Vercel integration |

---

## Database setup

Once Neon is connected via the Vercel marketplace integration, run the contents
of `db/schema.sql` once in the Neon SQL Editor. That's the entire migration.

---

## Local dev

```bash
cp .env.example .env.local
# fill in real values, including a DATABASE_URL pointing at your Neon db

npm install
npm run dev
# open http://localhost:3000
```

---

## Adding a new app to pinkcrocodile.dev

1. Copy `lib/auth.ts`, `middleware.ts`, and `lib/db.ts` into the new app
2. Make sure the new app reads the same shared env vars
3. If the new app should access shared memory, query the same `meal_memories`
   table or create a sibling table (e.g. `critique_memories`) in the same DB
4. Deploy. Users who logged into meals.pinkcrocodile.dev already have a valid
   session for the new subdomain — no second login.
