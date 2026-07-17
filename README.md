# MyWitness

Private personal ministry companion — record conversations, organize interested people, prepare return visits, and track ministry sessions.

> This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.

## Features

- Mobile-first app shell with Today, People, Return Visits, Activity, and Settings
- Ministry session timer (start / end / manual entry)
- Voice conversation capture with transcription + AI extraction
- Manual conversation notes with the same editable fields
- People profiles with chronological conversation timelines
- Return visit scheduling and preparation pages
- Activity summaries for personal reflection
- Demo mode with fictional sample data (including Joan)
- Supabase auth, RLS, export, and account deletion

## Prerequisites

- Node.js 20+
- A Supabase project
- An OpenAI API key (for transcription + extraction)

## 1. Install

```bash
npm install
```

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for account deletion |
| `OPENAI_API_KEY` | Server-only key for Whisper + structured extraction |
| `NEXT_PUBLIC_APP_URL` | App origin for auth redirects |

Never expose `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in client code.

## 3. Database setup

1. Open your Supabase project → **SQL Editor**
2. Run the migration in [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
3. Confirm Authentication → Providers → Email is enabled
4. (Optional) Authentication → URL Configuration → add `http://localhost:3000/auth/callback`

The migration creates:

- `profiles`, `user_settings`, `people`, `conversations`, `conversation_scriptures`
- `return_visits`, `ministry_sessions`, `reminders`
- indexes for search and upcoming visits
- row-level security so each user only sees their own rows
- private `conversation-audio` storage bucket

## 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quick start without Supabase

On the login screen, tap **Try with demo data**. Demo mode stores fictional data in the browser and simulates voice extraction using the Joan sample narrative.

## 5. Main user journey

1. Sign in (or start demo mode)
2. On **Today**, start a ministry session
3. Tap **Record Conversation**
4. Finish recording → review extracted fields → save
5. Optionally schedule a return visit
6. See it on the Today dashboard and Return Visits
7. Open the person’s timeline
8. End the ministry session

## 6. Deploy (Vercel)

1. Push the repo to GitHub
2. Import into Vercel
3. Add the same environment variables
4. Set `NEXT_PUBLIC_APP_URL` to your production URL
5. Add the production auth callback URL in Supabase

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npx tsc --noEmit # TypeScript check
```

## Privacy notes

- Exact GPS is never stored automatically
- Audio is uploaded to private storage and deleted after successful save unless the user chooses to keep it
- People are archived by default rather than hard-deleted
- Destructive actions require confirmation
- Account export and full deletion are available in Settings
