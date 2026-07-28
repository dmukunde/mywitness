# MyWitness — Project Overview

> An independent personal organization tool. Not affiliated with or endorsed by Jehovah's Witnesses or any of their legal entities.

This document is a map of the codebase for anyone picking up the project cold. It explains *why* the app exists, *how* it's built, *where* things live, and *what* to build next. It intentionally does not duplicate what's derivable by reading the code (exact function signatures, line-by-line logic) — read the source for that. Start here for orientation, then drill into files.

---

## 1. Vision

MyWitness is a **private, mobile-first companion app for personal ministry** — a single Jehovah's Witness organizing their own door-to-door and informal witnessing activity. It replaces a paper notebook / spreadsheet with:

- A fast way to capture a conversation (voice or text) right after it happens, with AI turning a spoken summary into structured notes.
- A single source of truth for the people met, what was discussed, and what was promised.
- A calendar of return visits and Bible studies so nothing promised is forgotten.
- Personal ministry-time tracking for reflection (not organizational reporting).

Design principles that show up throughout the code:

- **Private by default.** Single-user data model, Row Level Security on every table, audio deleted after transcription unless the user explicitly opts to keep it.
- **Never invent facts.** The AI extraction system prompt explicitly forbids fabricating details; uncertain fields are flagged in the UI for the user to confirm rather than silently trusted.
- **Frictionless capture, editable everything.** Voice → transcript → structured extraction → human review/edit → save. The AI is a first draft, never the final record.
- **Works without a backend.** A full "demo mode" (`localStorage`-backed) lets anyone explore the entire UI with fictional data and zero Supabase setup — used for onboarding and for this being a portfolio/demo-able project.

---

## 2. Architecture

**Shape:** Next.js App Router SPA-per-user, talking directly to Supabase (Postgres + Auth + Storage) from the browser, with a thin server layer only where a secret is required.

```
┌─────────────────────────────┐
│  Browser (React 19 client)   │
│  ─────────────────────────   │
│  AppProvider (single context)│──── holds ALL domain state + mutators
│  Supabase browser client     │──── direct CRUD, protected by RLS
└───────────┬──────────────────┘
            │ fetch (only for secret-requiring ops)
            ▼
┌─────────────────────────────┐
│  Next.js API routes          │
│  /api/transcribe  (Whisper)  │──── needs OPENAI_API_KEY
│  /api/extract     (GPT)      │──── needs OPENAI_API_KEY
│  /api/delete-account         │──── needs SUPABASE_SERVICE_ROLE_KEY
│  /api/export                  │──── reads via user's own session
└───────────┬──────────────────┘
            ▼
┌─────────────────────────────┐
│  Supabase                    │
│  Postgres (RLS per table)    │
│  Auth (email/password)       │
│  Storage (conversation-audio)│
└───────────────────────────────┘
```

**Key architectural decisions:**

- **No custom backend API for CRUD.** Reads/writes to `people`, `conversations`, `return_visits`, etc. go straight from the browser to Supabase using the anon key; **Row Level Security is the only authorization boundary**. There is no server-side business-logic layer for normal mutations.
- **API routes exist only for secrets.** OpenAI calls need `OPENAI_API_KEY` (server-only); account deletion needs `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS on purpose). Everything else stays client-side.
- **One global state container.** [`src/lib/app-context.tsx`](src/lib/app-context.tsx) is a single React Context (`AppProvider`) that owns every entity (people, conversations, return visits, sessions, reminders, Bible studies, calendar events) and every mutator function. There is no query cache library (no React Query/SWR) — mutations typically call `refresh()`, which re-runs a bundle of parallel Supabase queries to reload everything.
- **Demo mode is a parallel data path, not a separate app.** The same `AppProvider` and the same UI components serve two backends: Supabase (real) or `localStorage` (demo). Nearly every mutator branches internally: `if (demoMode) { ...localStorage... } else { ...supabase... }`.
- **Middleware + client-side gate (defense in depth).** [`src/middleware.ts`](src/middleware.ts) redirects unauthenticated requests to `/login` at the edge; [`src/app/(app)/layout.tsx`](<src/app/(app)/layout.tsx>) redundantly re-checks auth state client-side before rendering the app shell.
- **AI extraction is deterministic-first, LLM-assisted.** [`src/lib/ai/extract-pipeline.ts`](src/lib/ai/extract-pipeline.ts) calls GPT-4o-mini for structured extraction, then runs regex-based fallbacks (scripture references, questions, relative-date resolution) to fill gaps and rebuilds the summary from structured fields only — reducing hallucination risk.

---

## 3. Folder structure

```
mywitness/
├── PROJECT.md                    ← you are here
├── README.md                     Quick start
├── DEPLOY.md                     Go-live checklist (env vars, SQL migration, Vercel steps)
├── .env.example                  Required environment variables
├── vercel.json                   Vercel deployment config
├── supabase/
│   └── migrations/                5 sequential, hand-run SQL migrations (see §4)
├── src/
│   ├── app/
│   │   ├── (app)/                 Authenticated route group — shares BottomNav + auth gate
│   │   │   ├── layout.tsx          Auth check, demo-mode banner, bottom nav shell
│   │   │   ├── today/              Home dashboard
│   │   │   ├── people/             People list, detail (`[id]`), create (`new`)
│   │   │   ├── conversations/      `new` (manual) and `record` (voice) capture flows
│   │   │   ├── return-visits/      List + detail (`[id]`)
│   │   │   ├── bible-studies/      List, detail, `new`, per-study `record`/`session`
│   │   │   ├── calendar/           Unified return-visit + Bible-study calendar
│   │   │   ├── sessions/           Ministry session detail (`[id]`)
│   │   │   ├── activity/           Personal reflection / activity summaries
│   │   │   └── settings/           Profile, preferences, export, delete account
│   │   ├── api/
│   │   │   ├── transcribe/route.ts   Whisper transcription + upload + extraction
│   │   │   ├── extract/route.ts      Re-run GPT extraction on an existing transcript
│   │   │   ├── delete-account/route.ts  Service-role cascade delete
│   │   │   └── export/route.ts       JSON export of the user's own data
│   │   ├── auth/callback/route.ts   OAuth/email-confirm code exchange
│   │   ├── login/page.tsx           Sign in / sign up / demo mode entry
│   │   └── layout.tsx               Root layout, fonts, `AppProvider`
│   ├── components/                 Presentational + smart form components (see §5)
│   ├── hooks/
│   │   ├── useVoiceRecorder.ts      MediaRecorder wrapper (pause/resume/cancel)
│   │   └── useReminders.ts          Browser Notification integration
│   └── lib/
│       ├── ai/
│       │   ├── extraction.ts         Public entry point + retry orchestration
│       │   ├── extract-pipeline.ts   Zod schema, prompt, regex fallbacks, summary builder
│       │   ├── relative-dates.ts     "next Friday" → ISO date resolution
│       │   ├── openai-errors.ts      Error shaping for API responses
│       │   ├── study-extraction.ts   Bible-study-session variant of extraction
│       │   └── __tests__/            Vitest unit tests (regex fallbacks only)
│       ├── supabase/
│       │   ├── client.ts             Browser client + `isSupabaseConfigured()`
│       │   ├── server.ts             SSR client + service-role client
│       │   └── middleware.ts         Session refresh + route gating logic
│       ├── app-context.tsx           ← the single global state container (see §2, §7)
│       ├── ministry-api.ts           Bible-study/calendar mutators (demo + remote pairs)
│       ├── ministry-scheduling.ts    Duplicate-event detection
│       ├── bible-study.ts            Lesson-number parsing helpers
│       ├── demo-data.ts              Fictional seed dataset (incl. "Joan")
│       ├── demo-store.ts             localStorage read/write for demo mode
│       ├── auth-errors.ts            Auth error message helpers
│       ├── types.ts                  All domain types + form-data shapes + label maps
│       └── utils.ts                  Date/duration formatting, string helpers
```

---

## 4. Database tables

All tables live in Supabase Postgres, defined across 5 additive migrations in `supabase/migrations/`. **Every table has Row Level Security enabled** with the same policy shape: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` (or `= id` for `profiles`).

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `profiles` | 1:1 with `auth.users` | `display_name` (never derived from email — see migration 003) |
| `user_settings` | Per-user preferences | `keep_audio_after_transcription`, `browser_notifications_enabled`, `reminder_minutes_before` |
| `people` | Everyone the user has met | `interest_level` (enum, see below), `archived_at` (soft delete), full-text GIN index (currently unused by app code) |
| `ministry_sessions` | A block of ministry time | `start_time`/`end_time`/`duration_minutes`, `session_date` |
| `conversations` | One conversation record | Links to `people` + optionally `ministry_sessions`; `source` (`voice`/`manual`), `transcript`, `audio_path`, `keep_audio` |
| `conversation_scriptures` | Scriptures cited in a conversation | Child of `conversations`, one row per reference |
| `return_visits` | A promised follow-up | `status` (`planned`/`completed`/`cancelled`/`rescheduled`), links to originating `conversation` |
| `reminders` | Due/overdue/prep notifications | `reminder_type`, `due_at`, `dismissed_at` |
| `bible_studies` | An ongoing study with a person | `study_frequency`, `current_lesson_number`, `status` (`active`/`paused`/`completed`), `source_return_visit_id` (tracks RV→study conversion) |
| `bible_study_sessions` | One study session | Mirrors `conversations` shape but for lessons: `start_lesson`/`end_lesson`, `homework`, `next_lesson` |
| `scheduled_ministry_events` | **Unified calendar** across return visits + Bible studies | `event_type` CHECK constraint enforces exactly one of `return_visit_id`/`bible_study_id` is set |

**Shared enums** (defined as CHECK constraints, mirrored in [`src/lib/types.ts`](src/lib/types.ts)):
- `interest_level`: `unknown | very_low | low | moderate | high | very_high | bible_study`
- `ministry_type`: `house_to_house | public_witnessing | informal_witnessing | return_visits | bible_studies | letter_writing | telephone_witnessing | other`

**Other schema features:**
- `set_updated_at()` trigger auto-maintains `updated_at` on every mutable table.
- `handle_new_user()` trigger (SECURITY DEFINER, hardened `search_path`) auto-creates `profiles` + `user_settings` on signup — this trigger was fixed twice (migrations 002, 003) for real production bugs (missing grants, email leaking into display name).
- Storage bucket `conversation-audio` (private, 25MB limit, audio MIME allowlist) with per-user-folder RLS policies.
- Migration 005 backfills `scheduled_ministry_events` from existing `return_visits` — a good example pattern to follow for future additive schema changes.

**Migration file order** (run manually via Supabase SQL Editor per `DEPLOY.md` — there is no CLI-based migration tooling):
1. `001_initial_schema.sql` — core tables, RLS, storage bucket, signup trigger
2. `002_fix_signup_trigger.sql` — hardens the trigger (grants, search_path)
3. `003_display_name_no_email.sql` — stops using email local-part as display name
4. `004_interest_levels.sql` — expands the interest-level CHECK constraint
5. `005_bible_studies_calendar.sql` — adds Bible studies + unified calendar, backfills from return visits

---

## 5. Important components

### State & data
- **[`app-context.tsx`](src/lib/app-context.tsx)** — the center of gravity. Exposes `useApp()` with all entity arrays and ~20 mutator functions. Every mutation branches on `demoMode` internally. Understand this file before changing any data flow.
- **[`ministry-api.ts`](src/lib/ministry-api.ts)** — Bible-study and calendar-sync logic factored out of `app-context.tsx` into demo/remote function pairs (e.g. `saveBibleStudyDemo` / `saveBibleStudyRemote`). The pattern to extend if you split up `app-context.tsx` further.
- **[`types.ts`](src/lib/types.ts)** — canonical domain types, form-data shapes, and human-readable label maps (`INTEREST_LABELS`, `MINISTRY_TYPE_LABELS`, etc.). Change the DB schema → update here first.

### AI pipeline
- **[`ai/extract-pipeline.ts`](src/lib/ai/extract-pipeline.ts)** — the extraction system prompt, the Zod schema every AI response is validated against, a key-alias normalizer (tolerates GPT renaming fields), and regex-based fallback extractors for scriptures/questions/topics/dates.
- **[`ai/extraction.ts`](src/lib/ai/extraction.ts)** — orchestrates one GPT call, decides whether to retry (`shouldRetryExtraction`), and merges the best of both attempts.
- **[`hooks/useVoiceRecorder.ts`](src/hooks/useVoiceRecorder.ts)** — `MediaRecorder` wrapper handling start/pause/resume/cancel/finish, codec fallback (`webm` → `mp4`), and a live duration timer.

### UI
- **[`components/ui.tsx`](src/components/ui.tsx)** — the whole design system: `Button`, `Card`, `Input`, `Textarea`, `Select`, `Badge`, `PageHeader`, `EmptyState`, `ConfirmDialog`. No external UI library — Tailwind classes composed via `cn()`.
- **[`components/BottomNav.tsx`](src/components/BottomNav.tsx)** — the 5-tab primary navigation (Today, People, Calendar, Bible Studies, Settings).
- **[`components/ConversationForm.tsx`](src/components/ConversationForm.tsx)** / **`BibleStudyForm.tsx`** / **`StudySessionForm.tsx`** — large controlled forms mapping directly to their DB rows; used for both manual entry and post-AI-extraction review/edit.
- **[`app/(app)/conversations/record/page.tsx`](<src/app/(app)/conversations/record/page.tsx>)** — the flagship screen: record → upload → transcribe → extract → summary review (with "please confirm" flags on uncertain fields) → optional detailed edit → save. Read this to understand the app's core UX loop.

### Routing & auth
- **[`middleware.ts`](src/middleware.ts)** + **[`supabase/middleware.ts`](src/lib/supabase/middleware.ts)** — edge-level session refresh and login redirect.
- **[`app/login/page.tsx`](src/app/login/page.tsx)** — sign in/up, demo-mode entry point, careful error-message sanitization.
- **[`app/auth/callback/route.ts`](src/app/auth/callback/route.ts)** — exchanges an email-confirmation code for a session.

---

## 6. Feature list

- **Mobile-first app shell** with bottom navigation: Today, People, Calendar, Bible Studies, Settings (plus Return Visits, Sessions, Activity reachable from within those).
- **Ministry time tracking** — manual daily entry (hours/minutes + reflection notes), surfaced on the Today dashboard.
- **Voice conversation capture** — record in-browser, upload, Whisper transcription, GPT-4o-mini structured extraction (person, topic, scriptures, questions, return-visit date/time, materials shared, interest level, summary), with regex-based fallbacks and a mandatory human review step.
- **Manual "Write Notes"** — the same structured fields as voice capture, entered by hand.
- **People profiles** — chronological conversation history per person, interest-level tracking, location/contact-time preferences, private notes, archiving (soft delete).
- **Return visit scheduling** — promised follow-ups with preparation notes, status lifecycle (planned/completed/cancelled/rescheduled), duplicate-event detection.
- **Bible studies** — ongoing study tracking with lesson progression, frequency, session history; can be converted from a return visit (auto-completes the source RV).
- **Unified ministry calendar** — return visits and Bible studies merged into one scheduled-events view.
- **Reminders** — browser notifications for due/overdue return visits and pre-visit preparation windows.
- **Activity summaries** — personal reflection view over recorded ministry time and conversations.
- **Demo mode** — complete fictional dataset (including a sample contact "Joan"), zero backend required, clearly banner-marked in the UI.
- **Account & data controls** — Supabase-authenticated accounts, RLS-protected data, JSON data export, full account deletion (service-role cascade across all tables + storage).

---

## 7. Future roadmap

Ordered by leverage — earlier items unblock or de-risk later ones. (See the fuller architectural review in conversation history for detailed rationale on each.)

### Near-term (cost/correctness risk)
1. **Rate-limit `/api/transcribe` and `/api/extract`** — currently any authenticated request can trigger an OpenAI call with no throttling.
2. **Resolve the unused full-text search indexes** (`idx_people_search`, `idx_conversations_search`) — either build a search feature on top of them or drop them.
3. **Move `interest_level` sync** (currently duplicated on `people` and `conversations`, kept in sync by application code in `app-context.tsx`) into a DB trigger or view to remove a class of drift bugs.

### Structural (unlocks scale)
4. **Break up `app-context.tsx`** into per-domain modules (people, conversations, return visits, Bible studies, sessions), each behind a shared `DataAdapter`-style interface so "demo vs. Supabase" is one seam instead of duplicated inline branches in every mutator.
5. **Replace "mutate → refetch everything" with targeted updates** — introduce React Query/SWR (or hand-rolled optimistic updates) so a single-field edit doesn't re-run 11 parallel queries against the whole dataset.
6. **Adopt Supabase CLI migrations** instead of hand-pasted SQL in the dashboard, for reproducible, diffable schema deploys.

### Quality
7. **Test coverage for `app-context.tsx` mutators and API routes** — today only the regex extraction fallbacks are tested; this is exactly the surface most at risk during the structural refactor above.

### Polish / scale-as-needed
8. **Pagination** for people/conversations/return-visits once list sizes grow past a few hundred rows.
9. **Accessibility pass** — `aria-live` regions for async recorder/save status, contrast/colorblind-safe review of status badges.
10. **Resolve the ministry-session-timer ambiguity** — the schema (`start_time`/`end_time` on `ministry_sessions`) implies a live start/stop timer, but the current UI only supports manual daily entry. Either build the live timer or simplify the schema to match reality.
11. **Offline/multi-device sync** — only relevant if this stops being strictly single-device personal use; the current fetch-everything model won't extend cleanly to real-time multi-client sync without Supabase Realtime or a proper sync engine.

---

*Last reviewed: 2026-07-28, against commit `db470fd` ("Add Bible Studies, calendar, and ministry scheduling").*
