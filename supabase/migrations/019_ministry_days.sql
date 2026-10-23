-- Ministry days: the days of the week a publisher usually visits or meets a
-- person (Wednesday, Saturday, ...). Optional, several per person, and purely
-- for organising People: it never creates a visit, study, calendar event or
-- notification.
--
-- Backward compatible: every existing contact gets an empty list (unassigned)
-- and is otherwise unchanged. No new table, so no new Data API grants needed
-- (the existing table-level grants cover the new column). Safe to re-run.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS ministry_days TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'people_ministry_days_valid' AND conrelid = 'public.people'::regclass
  ) THEN
    ALTER TABLE public.people
      ADD CONSTRAINT people_ministry_days_valid
      CHECK (ministry_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);
  END IF;
END $$;

-- Merging two contacts now also combines their ministry days (and undoing the
-- merge puts the kept contact's days back). Replaces the function from 017;
-- the only change is the "Ministry days" block.

CREATE OR REPLACE FUNCTION public.merge_people(p_keep UUID, p_merge UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_keep public.people%ROWTYPE;
  v_merge public.people%ROWTYPE;
  v_log UUID := gen_random_uuid();
  v_moved JSONB := '{}'::jsonb;
  v_ids JSONB;
  v_cancelled UUID[];
  v_kv JSONB;
  v_mv JSONB;
  v_orig JSONB;
  v_changed TEXT[] := '{}';
  v_prev JSONB := '{}'::jsonb;
  f TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in';
  END IF;
  IF p_keep = p_merge THEN
    RAISE EXCEPTION 'cannot_merge_same_person';
  END IF;

  -- Only your own, still-active contacts. RLS enforces this too.
  SELECT * INTO v_keep FROM public.people
    WHERE id = p_keep AND user_id = v_uid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found'; END IF;
  SELECT * INTO v_merge FROM public.people
    WHERE id = p_merge AND user_id = v_uid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found'; END IF;

  -- A still-planned visit that is identical (date and time) to one the kept
  -- contact already has would be a duplicate appointment: cancel it (kept as
  -- history) instead of colliding.
  WITH clash AS (
    SELECT rv.id FROM public.return_visits rv
    WHERE rv.person_id = p_merge AND rv.status = 'planned'
      AND EXISTS (
        SELECT 1 FROM public.return_visits k
        WHERE k.person_id = p_keep AND k.status = 'planned'
          AND k.scheduled_date = rv.scheduled_date
          AND COALESCE(k.scheduled_time, '') = COALESCE(rv.scheduled_time, '')
      )
  ), cancelled AS (
    UPDATE public.return_visits SET status = 'cancelled'
    WHERE id IN (SELECT id FROM clash) RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_cancelled FROM cancelled;
  UPDATE public.scheduled_ministry_events SET status = 'cancelled'
    WHERE return_visit_id = ANY(v_cancelled) AND status = 'planned';
  v_moved := v_moved || jsonb_build_object('cancelled_visits', to_jsonb(v_cancelled));

  -- Move everything that points at the merged contact.
  WITH u AS (UPDATE public.conversations SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('conversations', v_ids);

  WITH u AS (UPDATE public.return_visits SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('return_visits', v_ids);

  WITH u AS (UPDATE public.bible_studies SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('bible_studies', v_ids);

  WITH u AS (UPDATE public.bible_study_sessions SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('bible_study_sessions', v_ids);

  WITH u AS (UPDATE public.scheduled_ministry_events SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('scheduled_ministry_events', v_ids);

  WITH u AS (UPDATE public.person_photos SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('person_photos', v_ids);

  WITH u AS (UPDATE public.personal_reminders SET person_id = p_keep
             WHERE person_id = p_merge RETURNING id)
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_ids FROM u;
  v_moved := v_moved || jsonb_build_object('personal_reminders', v_ids);

  -- Fill details the kept contact is missing; where both have notes, keep both.
  v_kv := to_jsonb(v_keep);
  v_orig := v_kv;
  v_mv := to_jsonb(v_merge);
  FOREACH f IN ARRAY ARRAY[
    'phone_number', 'general_location', 'area_id', 'location_lat', 'location_lng',
    'preferred_contact_time', 'current_discussion_theme', 'key_questions', 'private_notes'
  ] LOOP
    IF (v_kv -> f) IS NULL OR (v_kv -> f) = 'null'::jsonb OR (v_kv ->> f) = '' THEN
      IF (v_mv -> f) IS NOT NULL AND (v_mv -> f) <> 'null'::jsonb AND (v_mv ->> f) <> '' THEN
        v_kv := jsonb_set(v_kv, ARRAY[f], v_mv -> f);
        v_changed := v_changed || f;
      END IF;
    ELSIF f IN ('private_notes', 'key_questions')
          AND (v_mv ->> f) IS NOT NULL AND (v_mv ->> f) <> ''
          AND (v_mv ->> f) <> (v_kv ->> f) THEN
      v_kv := jsonb_set(v_kv, ARRAY[f], to_jsonb((v_kv ->> f) || E'\n\n' || (v_mv ->> f)));
      v_changed := v_changed || f;
    END IF;
  END LOOP;

  -- Ministry days: the kept contact ends up with the days of both. The change
  -- is recorded like the details above, so undoing the merge restores it.
  IF EXISTS (SELECT 1 FROM unnest(v_merge.ministry_days) d WHERE d <> ALL (v_keep.ministry_days)) THEN
    v_kv := jsonb_set(v_kv, '{ministry_days}', to_jsonb(ARRAY(
      SELECT d FROM unnest(ARRAY['mon','tue','wed','thu','fri','sat','sun']) d
      WHERE d = ANY (v_keep.ministry_days) OR d = ANY (v_merge.ministry_days)
    )));
    v_changed := array_append(v_changed, 'ministry_days');
  END IF;

  FOREACH f IN ARRAY v_changed LOOP
    v_prev := v_prev || jsonb_build_object(f, v_orig -> f);
    EXECUTE format(
      'UPDATE public.people p SET %1$I = r.%1$I FROM jsonb_populate_record(NULL::public.people, $1) r WHERE p.id = $2',
      f
    ) USING jsonb_build_object(f, v_kv -> f), p_keep;
  END LOOP;

  -- Hide (never delete) the merged contact.
  UPDATE public.people
    SET archived_at = NOW(), merged_into_id = p_keep
    WHERE id = p_merge;

  INSERT INTO public.person_merges (id, user_id, kept_person_id, merged_person_id, moved)
  VALUES (
    v_log, v_uid, p_keep, p_merge,
    v_moved || jsonb_build_object('changed', to_jsonb(v_changed), 'prev', v_prev)
  );

  RETURN v_log;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_people(UUID, UUID) TO authenticated;
