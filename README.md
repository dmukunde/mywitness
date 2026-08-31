# MyWitness

Private personal ministry companion — record conversations, organize interested people, prepare return visits, and track ministry sessions.

> This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.

**Going live today?** Follow **[DEPLOY.md](./DEPLOY.md)** for env vars, the SQL migration, and Vercel steps.

## Features

- Installable PWA — add to home screen on Android Chrome and iPhone Safari, opens standalone
- Mobile-first app shell with Today, People, Calendar, Bible Studies, and Settings
- Ministry session timer (start / pause / resume / end / manual entry)
- Voice conversation capture with transcription + AI extraction
- Manual **Write Notes** with the same editable fields
- People profiles with chronological conversation timelines, areas/neighbourhoods, and waypoint photos
- Return visit and Bible Study scheduling, archiving, and calendar sync
- Activity summaries (today / week / month / year / all-time) for personal reflection
- Backup export and restore
- Study Notebook — a private place for Family Worship, meeting preparation, convention notes, and personal study (see [PROJECT.md](./PROJECT.md) §8)
- Demo mode with fictional sample data (including Joan)
- Supabase auth (including password reset), RLS, export, and account deletion

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill real keys
# Run supabase/migrations/001 through 011, in order, in Supabase SQL Editor
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
