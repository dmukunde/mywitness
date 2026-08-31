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

In Supabase → **SQL Editor** → New query → paste and run each file **in order**, `001` through `012`:

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
