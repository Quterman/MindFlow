# MindFlow

MindFlow is a reflection diary that turns a free-form daily entry into a
concise summary, insights, actionable next steps, and recurring themes.

The app uses Supabase for authentication and private per-user persistence.
Reflection analysis runs on the server through OpenRouter and falls back to
local rules if the AI provider is temporarily unavailable.

## Getting started

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`

Then install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000/app](http://localhost:3000/app).

## Checks

```bash
npm run lint
npm run build
```

The OpenRouter key is server-only and must never use a `NEXT_PUBLIC_` prefix.
Apply the versioned SQL migrations in `supabase/migrations` before running code
that depends on newly added database columns.
