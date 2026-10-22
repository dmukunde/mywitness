-- Explicit Data API grants for every MyWitness table.
--
-- From 2026-10-30 Supabase no longer grants API access to new tables in the
-- "public" schema automatically. Tables that already exist keep their grants,
-- so on the live project this changes nothing. It exists so that a NEW project,
-- a preview branch, or a local `supabase db reset` (which replay the earlier
-- migrations that never needed grants) ends up with a working app.
--
-- Least privilege: signed-in users and the server only. The signed-out role
-- gets nothing — none of this data is public. Row-level security still decides
-- which rows each person can read or change. Safe to re-run; tables that don't
-- exist yet are skipped.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'user_settings', 'areas', 'people', 'conversations',
    'conversation_scriptures', 'return_visits', 'ministry_sessions',
    'reminders', 'bible_studies', 'bible_study_sessions',
    'scheduled_ministry_events', 'person_photos', 'study_notes',
    'toolkit_entries', 'person_merges', 'personal_reminders',
    'push_subscriptions'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t
      );
    END IF;
  END LOOP;
END $$;
