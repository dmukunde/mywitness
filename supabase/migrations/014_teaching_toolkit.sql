-- My Teaching Toolkit: a private, reusable reference library for preparing
-- for and quickly consulting during field service — FAQs, scriptures and
-- conversation starters. Separate from Notes (which document ministry
-- activity): entries here need no dates, contacts or visits.
--
-- One shared table for all three kinds; they differ only in which free-text
-- fields get used. Stores only the user's OWN wording and scripture
-- references (as text) — never JW.org / JW Library publication content.
--
-- A later "link to a return visit or Bible study" feature is purely
-- additive: a separate link table pointing at entries by id, so nothing
-- here is ever copied onto a visit or study.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.toolkit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('faq', 'scripture', 'starter')),
  -- The question (FAQ), the topic/theme (scripture), or the opener (starter).
  title TEXT NOT NULL,
  explanation TEXT,
  scripture_refs TEXT[] NOT NULL DEFAULT '{}',
  suggested_response TEXT,
  follow_up_questions TEXT[] NOT NULL DEFAULT '{}',
  personal_notes TEXT,
  category TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS toolkit_entries_updated_at ON public.toolkit_entries;
CREATE TRIGGER toolkit_entries_updated_at
  BEFORE UPDATE ON public.toolkit_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_toolkit_entries_kind
  ON public.toolkit_entries(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_toolkit_entries_favorites
  ON public.toolkit_entries(user_id) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_toolkit_entries_recent
  ON public.toolkit_entries(user_id, last_used_at DESC) WHERE last_used_at IS NOT NULL;

ALTER TABLE public.toolkit_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own toolkit entries" ON public.toolkit_entries;
CREATE POLICY "Users manage own toolkit entries" ON public.toolkit_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
