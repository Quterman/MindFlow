# MindFlow

MindFlow is a reflection diary that turns a free-form daily entry into a
concise summary, insights, and actionable next steps.

## Getting started

Install dependencies and start the development server:

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

The current local version stores entries in an ignored SQLite database.
The planned production setup will use Supabase for persistent storage and
Vercel for hosting.
