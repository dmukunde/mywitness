# MyWitness

Private personal ministry companion — record conversations, organize interested people, prepare return visits, and track ministry sessions.

> This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.

**Going live today?** Follow **[DEPLOY.md](./DEPLOY.md)** for env vars, the SQL migration, and Vercel steps.

## Features

- Mobile-first app shell with Today, People, Return Visits, Activity, and Settings
- Ministry session timer (start / end / manual entry)
- Voice conversation capture with transcription + AI extraction
- Manual **Write Notes** with the same editable fields
- People profiles with chronological conversation timelines
- Return visit scheduling and preparation pages
- Activity summaries for personal reflection
- Demo mode with fictional sample data (including Joan)
- Supabase auth, RLS, export, and account deletion

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill real keys
# Run supabase/migrations/001_initial_schema.sql in Supabase SQL Editor
npm run dev
```

Full production checklist: **[DEPLOY.md](./DEPLOY.md)**

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npx tsc --noEmit
```
