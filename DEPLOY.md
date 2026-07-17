# MyWitness — Deploy & go-live checklist

Private personal ministry companion.

> This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.

## Environment variables (required)

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | For account deletion |
| `OPENAI_API_KEY` | Server only | Whisper + extraction — must be a real `sk-…` key |
| `NEXT_PUBLIC_APP_URL` | Browser + server | `http://localhost:3000` locally; your Vercel URL in production |

Copy `.env.example` → `.env.local` and fill real values. Restart `npm run dev` after changes.

## SQL migration (required once)

In Supabase → **SQL Editor** → New query → paste and run the full file:

**`supabase/migrations/001_initial_schema.sql`**

This creates tables, indexes, RLS policies, the signup trigger, and the private `conversation-audio` storage bucket.

### Supabase auth settings (recommended for same-day use)

1. Authentication → Providers → Email → enable Email
2. For fastest testing: disable **Confirm email** (or confirm once via inbox)
3. Authentication → URL Configuration:
   - Site URL: your app URL (`http://localhost:3000` or Vercel URL)
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://YOUR_VERCEL_DOMAIN/auth/callback`

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

1. **`OPENAI_API_KEY` must be a real key** — currently a placeholder blocks transcription  
2. **Run `001_initial_schema.sql`** in Supabase if you have not already  
3. **Disable or complete email confirmation** so sign-up can enter the app immediately  
4. Add the **same env vars on Vercel** before production deploy  
5. On first device use, allow **microphone** permission in the browser  

Demo mode still works for UI practice; it does **not** write to Supabase.
