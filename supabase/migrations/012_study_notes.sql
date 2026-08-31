-- Study Notebook: a private place for the user's own preparation and notes
-- (Family Worship, meeting preparation, convention notes, personal study).
-- One shared table for every note type — the differences between them are
-- just which free-text fields get used, not structural. Never stores or
-- reproduces JW.org/JW Library publication content — only the user's own
-- references and notes. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN (
    'family_worship', 'midweek_meeting', 'weekend_meeting',
    'convention', 'personal_study', 'other'
  )),
  title TEXT NOT NULL,
  session_label TEXT,
  note_date DATE NOT NULL,
  scripture_refs TEXT,
  references_text TEXT,
  body TEXT,
  is_comment BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS study_notes_updated_at ON public.study_notes;
CREATE TRIGGER study_notes_updated_at
  BEFORE UPDATE ON public.study_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_study_notes_list
  ON public.study_notes(user_id, archived_at, note_date DESC);
CREATE INDEX IF NOT EXISTS idx_study_notes_type
  ON public.study_notes(user_id, note_type);

ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own study notes" ON public.study_notes;
CREATE POLICY "Users manage own study notes" ON public.study_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
