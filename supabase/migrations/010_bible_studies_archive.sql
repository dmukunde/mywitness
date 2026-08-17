-- Soft-delete/archive for Bible Studies. Independent of `status` so an
-- archived study can be active/paused/completed underneath — archiving only
-- controls visibility, never deletes bible_study_sessions or notes.
-- Safe to re-run.

ALTER TABLE public.bible_studies ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bible_studies_archived
  ON public.bible_studies(user_id, archived_at);
