-- Contact guardrails: stop the same person being added twice, and let existing
-- duplicates be merged safely (and undone).
--
--  1. A database rule: adding a contact whose name exactly matches an existing
--     active contact is refused unless the user has confirmed it is a
--     DIFFERENT person (people.distinct_confirmed). Two genuinely different
--     people can still share a name — they just have to be confirmed, so it
--     can never happen by accident (a double tap, a retry, a stray page).
--  2. merge_people(): moves everything from one contact onto another in a
--     single all-or-nothing step, and records exactly what moved.
--  3. unmerge_people(): puts it all back from that record.
--
-- Nothing is ever deleted: the merged contact is archived (hidden), so a merge
-- is fully reversible. Safe to re-run.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS distinct_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.people(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 1. Refuse an unconfirmed exact-name duplicate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.guard_duplicate_person_name()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- The user said "this is a different person".
  IF NEW.distinct_confirmed THEN
    RETURN NEW;
  END IF;
  -- The same save arriving twice (a retry): let the primary key answer it, so
  -- callers still get the normal "already exists" response.
  IF EXISTS (SELECT 1 FROM public.people WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.people p
    WHERE p.user_id = NEW.user_id
      AND p.archived_at IS NULL
      AND public.normalize_person_name(p.name) = public.normalize_person_name(NEW.name)
  ) THEN
    RAISE EXCEPTION 'possible_duplicate_person'
      USING HINT = 'A contact with this name already exists. Link to them, or confirm this is a different person.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_guard_duplicate_name ON public.people;
CREATE TRIGGER people_guard_duplicate_name
  BEFORE INSERT ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_person_name();

-- ---------------------------------------------------------------------------
-- 2. Merge log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.person_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kept_person_id UUID NOT NULL,
  merged_person_id UUID NOT NULL,
  -- Exactly which rows moved, so the merge can be undone.
  moved JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_person_merges_user
  ON public.person_merges(user_id, created_at DESC);

ALTER TABLE public.person_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own person merges" ON public.person_merges;
CREATE POLICY "Users manage own person merges" ON public.person_merges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. merge_people(keep, merge)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 4. unmerge_people(log)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unmerge_people(p_log UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.person_merges%ROWTYPE;
  v_prev JSONB;
  v_cancelled UUID[];
  f TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_signed_in';
  END IF;

  SELECT * INTO v_row FROM public.person_merges
    WHERE id = p_log AND user_id = v_uid AND undone_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_not_found'; END IF;

  PERFORM 1 FROM public.people
    WHERE id = v_row.merged_person_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact_not_found'; END IF;

  -- Bring the merged contact back.
  UPDATE public.people
    SET archived_at = NULL, merged_into_id = NULL
    WHERE id = v_row.merged_person_id;

  -- Move back exactly the rows that moved (and only if they still sit with the
  -- kept contact, so anything added since is left where it is).
  UPDATE public.conversations SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'conversations'))::uuid);
  UPDATE public.return_visits SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'return_visits'))::uuid);
  UPDATE public.bible_studies SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'bible_studies'))::uuid);
  UPDATE public.bible_study_sessions SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'bible_study_sessions'))::uuid);
  UPDATE public.scheduled_ministry_events SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'scheduled_ministry_events'))::uuid);
  UPDATE public.person_photos SET person_id = v_row.merged_person_id
    WHERE person_id = v_row.kept_person_id
      AND id IN (SELECT (jsonb_array_elements_text(v_row.moved -> 'person_photos'))::uuid);

  -- Visits cancelled to avoid an identical appointment come back as planned
  -- (now that they are back with their own contact there is no clash).
  SELECT COALESCE(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_cancelled
    FROM jsonb_array_elements_text(v_row.moved -> 'cancelled_visits') x;
  UPDATE public.return_visits SET status = 'planned'
    WHERE id = ANY(v_cancelled) AND status = 'cancelled';
  UPDATE public.scheduled_ministry_events SET status = 'planned'
    WHERE return_visit_id = ANY(v_cancelled) AND status = 'cancelled';

  -- Put back the details the merge filled in on the kept contact.
  v_prev := COALESCE(v_row.moved -> 'prev', '{}'::jsonb);
  FOR f IN SELECT jsonb_array_elements_text(COALESCE(v_row.moved -> 'changed', '[]'::jsonb)) LOOP
    EXECUTE format(
      'UPDATE public.people p SET %1$I = r.%1$I FROM jsonb_populate_record(NULL::public.people, $1) r WHERE p.id = $2',
      f
    ) USING jsonb_build_object(f, v_prev -> f), v_row.kept_person_id;
  END LOOP;

  UPDATE public.person_merges SET undone_at = NOW() WHERE id = p_log;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_people(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmerge_people(UUID) TO authenticated;
