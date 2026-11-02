-- Fair-use limits for the voice-note (OpenAI) features.
--
-- Every transcription or extraction request is recorded as one small row: who,
-- what kind, how many seconds of audio, how many characters. NEVER any content.
-- Before a request is allowed the server asks `claim_ai_use` whether the person
-- is within their limits; the check and the recording happen as one step per
-- person, so two quick requests can't both slip through.
--
--   * per minute  - stops repeated automated requests
--   * per day     - rolling 24 hours, separately for transcriptions / extractions
--   * audio time  - minutes of audio per rolling 24 hours
--   * everyone    - one overall daily ceiling, a last guard on the OpenAI bill
--
-- The limit numbers are NOT stored here: the server passes them in (they come
-- from settings in Vercel), so you can change them without a new migration.
--
-- Only the server can call the two functions (not signed-in users, not the
-- public), so nobody can use them to fill the table or use up other people's
-- allowance. Rows older than 35 days are tidied away automatically.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('transcribe', 'extract')),
  audio_seconds INTEGER NOT NULL DEFAULT 0 CHECK (audio_seconds >= 0),
  chars INTEGER NOT NULL DEFAULT 0 CHECK (chars >= 0),
  -- Set when the request failed on our side, so it doesn't count against the person.
  released BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time
  ON public.ai_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time
  ON public.ai_usage_events(created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- People may see their own usage; nobody can write to the table directly.
DROP POLICY IF EXISTS "Users read own AI usage" ON public.ai_usage_events;
CREATE POLICY "Users read own AI usage" ON public.ai_usage_events
  FOR SELECT USING (auth.uid() = user_id);

-- Supabase no longer grants access to new tables automatically (from 2026-10-30).
-- Older projects still hand the signed-out role access to new tables by
-- default (row security then blocks it); take that away: nothing here is public.
REVOKE ALL ON public.ai_usage_events FROM anon;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_events TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_use(
  p_user_id UUID,
  p_kind TEXT,
  p_audio_seconds INTEGER,
  p_chars INTEGER,
  p_per_minute INTEGER,
  p_daily_count INTEGER,
  p_daily_audio_seconds INTEGER,
  p_global_daily INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_minute_count INTEGER;
  v_minute_oldest TIMESTAMPTZ;
  v_day_count INTEGER;
  v_day_audio BIGINT;
  v_day_oldest TIMESTAMPTZ;
  v_global INTEGER;
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;
  IF p_kind NOT IN ('transcribe', 'extract') THEN
    RAISE EXCEPTION 'bad_kind';
  END IF;

  -- One request at a time per person: the check and the recording below
  -- can't be interleaved with another request from the same person.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text, 0));

  DELETE FROM public.ai_usage_events
    WHERE user_id = p_user_id AND created_at < NOW() - INTERVAL '35 days';

  -- Per minute, all kinds together.
  SELECT COUNT(*), MIN(created_at) INTO v_minute_count, v_minute_oldest
    FROM public.ai_usage_events
    WHERE user_id = p_user_id AND NOT released
      AND created_at > NOW() - INTERVAL '1 minute';
  IF v_minute_count >= p_per_minute THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'rate',
      'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_minute_oldest + INTERVAL '1 minute' - NOW())))::INTEGER)
    );
  END IF;

  -- Rolling 24 hours, for this kind of request.
  SELECT COUNT(*), COALESCE(SUM(audio_seconds), 0), MIN(created_at)
    INTO v_day_count, v_day_audio, v_day_oldest
    FROM public.ai_usage_events
    WHERE user_id = p_user_id AND kind = p_kind AND NOT released
      AND created_at > NOW() - INTERVAL '24 hours';
  IF v_day_count >= p_daily_count THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'daily',
      'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_day_oldest + INTERVAL '24 hours' - NOW())))::INTEGER)
    );
  END IF;
  IF p_kind = 'transcribe' AND v_day_audio + p_audio_seconds > p_daily_audio_seconds THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'audio_minutes',
      'retry_after', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_day_oldest + INTERVAL '24 hours' - NOW())))::INTEGER)
    );
  END IF;

  -- Everyone together: a last guard on the overall bill.
  SELECT COUNT(*) INTO v_global
    FROM public.ai_usage_events
    WHERE NOT released AND created_at > NOW() - INTERVAL '24 hours';
  IF v_global >= p_global_daily THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'global');
  END IF;

  INSERT INTO public.ai_usage_events (user_id, kind, audio_seconds, chars)
    VALUES (p_user_id, p_kind, GREATEST(p_audio_seconds, 0), GREATEST(p_chars, 0))
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'remaining_today', p_daily_count - v_day_count - 1);
END;
$$;

-- Gives the allowance back when OpenAI (or we) failed, so a failed attempt
-- doesn't use up someone's day.
CREATE OR REPLACE FUNCTION public.release_ai_use(p_user_id UUID, p_id UUID)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.ai_usage_events SET released = TRUE
  WHERE id = p_id AND user_id = p_user_id;
$$;

-- Server only: not signed-in users, not the public.
REVOKE ALL ON FUNCTION public.claim_ai_use(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_use(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_ai_use(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_use(UUID, UUID) TO service_role;
