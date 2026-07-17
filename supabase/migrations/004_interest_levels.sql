-- Expand interest_level options for people + conversations.
-- Safe to re-run.

ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_interest_level_check;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_interest_level_check;

ALTER TABLE public.people
  ADD CONSTRAINT people_interest_level_check
  CHECK (
    interest_level IS NULL OR interest_level IN (
      'unknown', 'very_low', 'low', 'moderate', 'high', 'very_high', 'bible_study'
    )
  );

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_interest_level_check
  CHECK (
    interest_level IS NULL OR interest_level IN (
      'unknown', 'very_low', 'low', 'moderate', 'high', 'very_high', 'bible_study'
    )
  );
