# MyWitness — Deploy & go-live checklist

Private personal ministry companion.

> This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.

## Environment variables (required)

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | For account deletion |
| `OPENAI_API_KEY` | Server only | Whisper + extraction (voice conversation capture) — must be a real `sk-…` key. Without it, everything else works; only voice recording is unavailable. |
| `NEXT_PUBLIC_APP_URL` | Not currently read by any code | Documented for completeness only — the app derives its own origin from each request. Safe to set or omit. |

Copy `.env.example` → `.env.local` and fill real values. Restart `npm run dev` after changes.

## SQL migrations (required once per Supabase project)

In Supabase → **SQL Editor** → New query → paste and run each file **in order**, `001` through `020`:

| # | File | What it does |
|---|---|---|
| 001 | `001_initial_schema.sql` | Core tables, indexes, RLS policies, the signup trigger, private `conversation-audio` storage bucket |
| 002 | `002_fix_signup_trigger.sql` | Fixes the `profiles`/`user_settings` signup trigger |
| 003 | `003_display_name_no_email.sql` | Stops using the email local-part as a display name |
| 004 | `004_interest_levels.sql` | Expands `interest_level` options |
| 005 | `005_bible_studies_calendar.sql` | Bible Studies + the unified ministry calendar (`scheduled_ministry_events`) |
| 006 | `006_people_location_coordinates.sql` | Optional GPS coordinates on `people` |
| 007 | `007_people_phone_and_area.sql` | Phone numbers (WhatsApp) + the `areas` table |
| 008 | `008_ministry_sessions_source.sql` | Labels a ministry session as timer vs. manual |
| 009 | `009_person_photos.sql` | Waypoint photos per person + private `person-photos` storage bucket |
| 010 | `010_bible_studies_archive.sql` | Soft-delete/archive for Bible Studies |
| 011 | `011_user_settings_service_year.sql` | Configurable service-year start month |
| 012 | `012_study_notes.sql` | Study Notebook — Family Worship, meeting prep, convention, and personal study notes |
| 013 | `013_prevent_duplicate_scheduling.sql` | Database-level guard against the same visit/study being scheduled twice |
| 014 | `014_teaching_toolkit.sql` | My Teaching Toolkit entries |
| 015 | `015_contact_guardrails.sql` | Duplicate-name guard, contact merge / undo functions |
| 016 | `016_personal_reminders.sql` | Personal reminders + push notification devices |
| 017 | `017_reminders_follow_merges.sql` | Merging contacts also moves their reminders |
| 018 | `018_data_api_grants.sql` | Explicit Data API grants for every table (needed for new Supabase projects) |
| 019 | `019_ministry_days.sql` | Ministry days on people; merge combines days |
| 020 | `020_ai_usage_limits.sql` | Voice-note fair-use limits (usage log + server-only check functions) |

Every migration file is written to be safe to re-run (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), but **don't blindly rerun them against a project that's already up to date** — check first. To see what a given project already has, open **Supabase → Table Editor** and confirm: does `bible_studies` exist (005)? Does `people` have a `phone_number` column (007)? Does `bible_studies` have an `archived_at` column (010)? Does `user_settings` have `service_year_start_month` (011)? Does `study_notes` exist (012)? If all of those are present, the project is fully migrated — only run whichever numbered files are missing, in order.

> The Supabase project already referenced in this repo's `.env.local` has migrations 001–011 applied (confirmed live during the RC1 pass). **Migration 012 (`study_notes`) has not yet been run against it** — run it before using the Study Notebook feature against a real account. If you create a **separate** production Supabase project, run all 12 files in order before first use.

### Supabase auth settings (required)

1. Authentication → Providers → Email → enable Email
2. For fastest testing: disable **Confirm email** (or confirm once via inbox)
3. Authentication → URL Configuration:
   - Site URL: your app URL (`http://localhost:3000` or Vercel URL)
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://YOUR_VERCEL_DOMAIN/auth/callback`
   - **MANUAL VERIFICATION REQUIRED:** password reset (`Forgot password?`) sends users to `.../auth/callback?next=/auth/reset-password`. Confirm Supabase's redirect-URL allowlist accepts that query string on the registered `.../auth/callback` entry — Supabase normally matches by URL prefix so this should already work once the base callback URL above is registered, but verify by actually requesting a reset email and clicking the link once the production domain is live.
   - This same allowlist is what makes sign-up email confirmation links work in production — a domain missing here is the most common reason "it works on localhost but not on Vercel."

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 → Create account or Sign in.

## Deploy to Vercel (exact steps)

1. Push this repo to GitHub (do **not** commit `.env.local`)
2. [vercel.com](https://vercel.com) → Add New Project → Import the repo
3. Framework: Next.js (auto-detected)
4. Environment Variables → add all five variables above  
   Set `NEXT_PUBLIC_APP_URL` to `https://YOUR_PROJECT.vercel.app` (or custom domain)
5. Deploy
6. In Supabase, add the production callback URL (see above)
7. Open the Vercel URL → create account → start ministry

Optional CLI:

```bash
npm i -g vercel
vercel
vercel env add OPENAI_API_KEY
# …add the other vars
vercel --prod
```

## Core workflow (production)

1. Sign in / create account  
2. Start Ministry Session  
3. Record Conversation  
4. Speak a short summary → Finish  
5. Review editable extracted fields  
6. Save & schedule return visit  
7. See it on Today  
8. End Session  

## Remaining blockers before real ministry

1. **`OPENAI_API_KEY` must be a real key** — currently a placeholder blocks transcription (voice capture only; everything else works without it)
2. **Run all of `001` through `011`** in Supabase if you have not already — see the migration table above, and check what's already applied before rerunning anything
3. **Disable or complete email confirmation** so sign-up can enter the app immediately
4. Add the **same env vars on Vercel** before production deploy
5. Add the production domain to Supabase's **Redirect URLs** allowlist (see above) — required for sign-up confirmation and password-reset links to work
6. On first device use, allow **microphone** permission in the browser (only needed for voice conversation capture)

Demo mode still works for UI practice; it does **not** write to Supabase.

## Installing as an app (PWA)

MyWitness ships a web app manifest and a minimal service worker (RC1) so it can be installed to a phone's home screen from the live Vercel URL:

- **Android Chrome:** open the site → menu (⋮) → "Install app" (or the install icon in the address bar).
- **iPhone Safari:** open the site → Share → "Add to Home Screen".

No extra Supabase/Vercel configuration is required for this — it works from static files served by Next.js. See `public/manifest.webmanifest` and `public/sw.js`.

## Reminder notifications (push) — one-time setup

Reminders work without any of this (they show on Home and the Reminders screen, alert while the app is open, and can be added to a calendar). To also get a notification **when the app is closed**, set up three things:

1. **Run migrations `016`, `017` and `018`** in the Supabase SQL Editor, in that order (`016` reminders + devices tables, `017` contact merges carry reminders, `018` explicit Data API grants for every table — Supabase stops granting access to new tables automatically from 2026-10-30, so every new table migration must include its own `GRANT`s).
2. **Create a key pair and a secret** and add all four to Vercel (Settings → Environment Variables) and `.env.local`, then redeploy:
   - `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key) and `VAPID_PRIVATE_KEY` (private key — keep secret)
   - `VAPID_SUBJECT` = `mailto:you@example.com`
   - `CRON_SECRET` = any long random string (for example 40+ random characters)
3. **Run the sender every minute.** Vercel's free plan only allows daily scheduled jobs, so use a Supabase scheduled job (Database → Extensions: enable `pg_cron` and `pg_net`), then in the SQL Editor:

   ```sql
   select cron.schedule(
     'mywitness-reminders',
     '* * * * *',
     $$ select net.http_post(
          url := 'https://mywitness.vercel.app/api/reminders/dispatch',
          headers := jsonb_build_object('Authorization', 'Bearer <YOUR CRON_SECRET>')
        ) $$
   );
   ```
   (To stop it: `select cron.unschedule('mywitness-reminders');`)

Then open **Reminders → Notifications → Turn on notifications**, and tap **Send a test** to confirm it reaches the device. On iPhone/iPad the app must first be added to the Home Screen (Share → Add to Home Screen).

How it stays reliable: each due reminder is claimed in the database (`notified_at`) before it is sent, so overlapping runs can't send it twice; each notification also carries the reminder's id as its tag, so a device shows one notification per reminder; a device the push service reports as gone is removed automatically.

## Voice-note limits (OpenAI cost protection)

Voice notes call OpenAI, which costs money, so the server limits how much any one account can use. Everything is enforced on the server; the app only mirrors the 10-minute recording length.

**Needs migration 020.** Until it has been run, the server falls back to conservative per-instance limits (it never becomes unlimited), and logs `[ai-usage] database limits not available (run migration 020)`.

**Built-in limits (per person unless stated):**

| Limit | Default | Setting in Vercel (all optional) |
|---|---|---|
| Requests per minute | 5 | `AI_LIMIT_PER_MINUTE` |
| Voice notes per rolling 24 hours | 40 | `AI_LIMIT_DAILY_TRANSCRIPTIONS` |
| Text extractions per rolling 24 hours | 80 | `AI_LIMIT_DAILY_EXTRACTIONS` |
| Minutes of audio per rolling 24 hours | 120 | `AI_LIMIT_DAILY_AUDIO_MINUTES` |
| Everyone together per rolling 24 hours | 2000 | `AI_LIMIT_GLOBAL_DAILY` |
| One voice note | 10 minutes, 4 MB | fixed in `src/lib/ai/limits.ts` |
| Text sent for extraction | 15,000 characters | fixed in `src/lib/ai/limits.ts` |

A setting must be a whole number above zero; anything else is ignored and the default is used.

**Emergency off switch:** set `AI_DISABLED=1` in Vercel and redeploy. Voice notes pause for everyone with a friendly message; typing notes still works.

**Seeing usage (counts only, never content)** — run in the Supabase SQL Editor:

```sql
select date_trunc('day', created_at) as day, kind, count(*) as requests,
       sum(audio_seconds) / 60 as audio_minutes
from ai_usage_events
where not released
group by 1, 2
order by 1 desc, 2;
```

The server log also has one `[ai-usage]` line per request (kind, outcome, a short account id prefix, audio seconds, sizes), with no audio, transcripts, names or notes.

**Also set, in your OpenAI account (only you can):** a monthly budget with an email alert, and ideally a separate project for MyWitness's key. See `audit/Dashboard-Checklist.md`.

## Security headers

`next.config.ts` sends a Content-Security-Policy and other protective headers on every response (built in `src/lib/security-headers.ts`, with tests). Browsers may only connect to the app itself and your Supabase project; OpenAI is called only by the server. If a feature that needs a new outside address is ever added, it must be added there deliberately.

## Who can open which pages

`src/lib/route-access.ts` is the single list of pages that work without signing in (`/privacy`, `/terms`, `/support`, `/delete-account-info`, plus the service worker and manifest). Everything else needs a session, and API routes answer unauthenticated calls with a plain 401.

## Working with no signal (offline)

MyWitness opens and can be used with no data. Two parts make that work.

**1. The app's screens are kept on the phone.** After someone signs in, the app itself (`src/lib/offline/warm.ts`) saves the app's own screens and code in the browser's cache (about 0.5 MB, once per release), a few files at a time, and shows its progress: a note on screen, and **Settings → Using MyWitness without signal** (Ready / Getting ready / Not ready, with a Get ready now button). It is done by the app, not the service worker, because a phone stops a background worker after about 30 seconds, too soon to finish on a slow connection. If the signal drops part-way, it carries on later. The service worker (`public/sw.js`) is what serves the saved files when there is no signal. It saves only empty page shells and code, never anyone's records, and never anything from the server's API or Supabase. Screens for one person, study or visit use a saved placeholder ("/people/_" and so on); the screen reads the real id from the address (`src/hooks/useRouteParams.ts`). Each release installs its own worker (`?v=` build id), and the previous release's screens stay usable until the new ones are saved.

**2. The person's records are kept on the phone** (`src/lib/offline/`). After every successful load the app saves a copy of the records in the browser's database (IndexedDB) and opens from that copy first. With no signal the app shows that copy and a banner says so. Ministry time (start, stop, manual time, edit, delete) and people (add, edit, ministry days, and a new neighbourhood typed while adding someone) are saved on the phone first and put in a list of changes waiting to be sent, in the order they were made (a new neighbourhood is always sent before the person in it). They are sent automatically when signal returns (and every 30 seconds while the app is open). Nothing waiting is ever dropped silently: a change the server refuses stays visible with Try again / Discard, and signing out warns first if changes are unsent. Other changes (visits, studies, archiving, merging, photos, ...) still need internet and say so.

**Privacy of the copy on the phone:** it is protected by the phone's own lock, not separately encrypted. It is removed on sign-out and on account deletion, and another person's copy is cleared when someone new signs in (unless it has unsent changes).

**Switching the worker off (support):** in the browser, set `localStorage["mw-no-service-worker"] = "1"` and reload; the worker and its saved screens are removed. The worker is only registered in the deployed app, never in `npm run dev`.

**Testing it properly needs a real phone:** open the app with signal and wait a minute, then switch on airplane mode and open it from the Home Screen. Check the Today, Calendar, People, a person's page, the monthly report; start and stop the timer; add time manually. Then switch airplane mode off and check the banner clears and the time appears in the report. The worker's logic is covered by `src/lib/__tests__/service-worker.test.ts`, the queue by `src/lib/offline/__tests__/`.
