-- Permanently deleting an archived person, and everything recorded about them,
-- in ONE all-or-nothing step.
--
-- Why a function: deleting a person leaves some rows behind on its own (their
-- conversations and personal reminders only lose the link to them; the merge
-- log keeps their id). This removes all of it, together, so a failure half-way
-- can never leave pieces behind. It also hands back the paths of the person's
-- photos and conversation audio so the app can delete those files too.
--
-- Runs as the signed-in person (SECURITY INVOKER): row-level security means it
-- can only ever touch their own rows. Only an ARCHIVED person can be deleted,
-- so deleting is always a deliberate second step after archiving.
--
-- Safe to re-run. No new tables, so no new table grants are needed.

CREATE OR REPLACE FUNCTION public.delete_person_permanently(p_person UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_archived TIMESTAMPTZ;
  v_photos TEXT[];
  v_audio TEXT[];
BEGIN
  SELECT archived_at INTO v_archived FROM public.people WHERE id = p_person;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;
  IF v_archived IS NULL THEN
    RAISE EXCEPTION 'person_not_archived';
  END IF;

  SELECT COALESCE(array_agg(photo_path), ARRAY[]::TEXT[])
    INTO v_photos
    FROM public.person_photos
   WHERE person_id = p_person;

  SELECT COALESCE(array_agg(audio_path), ARRAY[]::TEXT[])
    INTO v_audio
    FROM public.conversations
   WHERE person_id = p_person AND audio_path IS NOT NULL;

  -- A merge record that mentions them could no longer be undone.
  DELETE FROM public.person_merges
   WHERE kept_person_id = p_person OR merged_person_id = p_person;

  -- Conversations (their scriptures go with them) and personal reminders only
  -- lose the link when a person is deleted, so remove them explicitly.
  DELETE FROM public.conversations WHERE person_id = p_person;
  DELETE FROM public.personal_reminders WHERE person_id = p_person;

  -- Everything else (return visits and their reminders, Bible studies and
  -- sessions, calendar entries, photo records) goes with the person.
  DELETE FROM public.people WHERE id = p_person;

  RETURN jsonb_build_object(
    'photo_paths', to_jsonb(v_photos),
    'audio_paths', to_jsonb(v_audio)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_person_permanently(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_person_permanently(UUID) TO authenticated;
