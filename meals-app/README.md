# Meals — Pink Crocodile

A small private meal-planning app for Ben & Jenny.
Lives at **meals.pinkcrocodile.dev**, gated by personal login,
backed by Anthropic's Claude API.

---

## What's in here

- **Next.js 15 (App Router)** with React 19
- **Edge middleware** that gates every route behind a session cookie
- **JWT sessions** signed with a server-side secret (using `jose`, Edge-compatible)
- **Cross-subdomain SSO** — cookie scoped to `.pinkcrocodile.dev` so logging
  in here also signs you into `critique.pinkcrocodile.dev`,
  `lab.pinkcrocodile.dev`, etc. when those exist
- **Chat UI** with auto-resizing composer and household preferences
- **Server-side Anthropic API proxy** (`/api/chat`) — API key never exposed to the browser
- **Editorial-kitchen aesthetic** — Fraunces serif + Geist, paper cream, rhubarb pink

```
meals-app/
├── app/
│   ├── api/
│   │   ├── auth/login         # POST credentials, set session cookie
│   │   ├── auth/logout        # POST to clear cookie
│   │   ├── chat               # POST messages to Anthropic, server-side
│   │   └── me                 # GET current username
│   ├── login/page.tsx         # Login page
│   ├── page.tsx               # The chat UI
│   ├── croc.tsx               # Crocodile mark
│   ├── globals.css            # All styles
│   └── layout.tsx
├── lib/
│   └── auth.ts                # Shared auth helpers — lift into a package later
├── middleware.ts              # Gates every route except /login
└── .env.example
```

---

## Required environment variables

Set these on the **Vercel team** (so they apply to every project on
pinkcrocodile.dev), not just on this single project:

| Variable | What it is |
|---|---|
| `AUTH_USERS_JSON` | JSON array: `[{"username":"ben","password":"..."},{"username":"jenny","password":"..."}]` |
| `AUTH_SECRET` | Long random string (≥32 chars) for signing session JWTs |
| `COOKIE_DOMAIN` | Set to `.pinkcrocodile.dev` (with leading dot) in production for SSO |
| `ANTHROPIC_API_KEY` | Your Claude API key |

---

## Local dev

```bash
cp .env.example .env.local
# fill in real values

npm install
npm run dev
# open http://localhost:3000
```

In local dev, leave `COOKIE_DOMAIN` blank — the cookie will scope to
localhost and auth will work fine.

---

## Adding a new user

Edit `AUTH_USERS_JSON` in the Vercel dashboard, redeploy. Done.

## Adding a new app to pinkcrocodile.dev

1. Copy `lib/auth.ts` and `middleware.ts` into the new app
2. Make sure the new app reads the same `AUTH_USERS_JSON`,
   `AUTH_SECRET` and `COOKIE_DOMAIN` env vars (all team-level
   so this is automatic)
3. Deploy. Users who logged into meals.pinkcrocodile.dev already
   have a valid session for the new subdomain — no second login.

When this happens enough times, lift `lib/auth.ts` and the
middleware pattern into a private npm package.
