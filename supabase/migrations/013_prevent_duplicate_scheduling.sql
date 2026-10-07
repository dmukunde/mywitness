-- Database-level protection against duplicate scheduled visits and calendar
-- events, so one user action (a double tap, a retry after a dropped
-- connection) can never leave two copies behind.
--
-- SAFE TO RUN AT ANY TIME: each index is only created if your data has no
-- duplicates for it yet. If duplicates exist, that index is skipped with a
-- NOTICE saying so — nothing fails and nothing is changed. In that case use
-- Settings → Data health → "Check for duplicates" in the app, then run this
-- file again. Safe to re-run.
--
-- (People are NOT made unique by name — two different people can share a
-- name. They're protected instead by the app giving each save a unique id.)

-- One still-planned visit per person, date and time.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.return_visits
    WHERE status = 'planned'
    GROUP BY user_id, person_id, scheduled_date, COALESCE(scheduled_time, '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped uniq_return_visits_planned_slot: repeated planned visits still exist. Run Settings > Data health > Check for duplicates, then re-run this file.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_return_visits_planned_slot
      ON public.return_visits (user_id, person_id, scheduled_date, (COALESCE(scheduled_time, '')))
      WHERE status = 'planned';
  END IF;
END $$;

-- One calendar event per return visit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scheduled_ministry_events
    WHERE return_visit_id IS NOT NULL
    GROUP BY return_visit_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped uniq_events_return_visit: extra calendar copies still exist. Run Settings > Data health > Check for duplicates, then re-run this file.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_return_visit
      ON public.scheduled_ministry_events (return_visit_id)
      WHERE return_visit_id IS NOT NULL;
  END IF;
END $$;

-- One planned calendar event per Bible study.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scheduled_ministry_events
    WHERE bible_study_id IS NOT NULL AND status = 'planned'
    GROUP BY bible_study_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped uniq_events_study_planned: repeated planned study events still exist. Run Settings > Data health > Check for duplicates, then re-run this file.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_study_planned
      ON public.scheduled_ministry_events (bible_study_id)
      WHERE bible_study_id IS NOT NULL AND status = 'planned';
  END IF;
END $$;
