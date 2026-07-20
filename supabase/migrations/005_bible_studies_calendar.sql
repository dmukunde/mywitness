-- Bible Studies + unified ministry calendar
-- Safe additive migration — does not alter or delete existing ministry data.

-- ---------------------------------------------------------------------------
-- bible_studies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  publication TEXT NOT NULL,
  starting_lesson TEXT,
  current_lesson TEXT,
  current_lesson_number INTEGER NOT NULL DEFAULT 1,
  total_lessons INTEGER NOT NULL DEFAULT 60,
  study_frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (study_frequency IN ('weekly', 'biweekly', 'monthly', 'custom')),
  preferred_day TEXT,
  preferred_time TEXT,
  first_study_date DATE,
  next_study_date DATE,
  next_study_time TEXT,
  last_study_date DATE,
  general_location TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed')),
  preparation_notes TEXT,
  private_notes TEXT,
  source_return_visit_id UUID REFERENCES public.return_visits(id) ON DELETE SET NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- bible_study_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bible_study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bible_study_id UUID NOT NULL REFERENCES public.bible_studies(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_lesson TEXT,
  end_lesson TEXT,
  topics_discussed TEXT,
  scriptures_discussed TEXT,
  questions_raised TEXT,
  material_completed TEXT,
  homework TEXT,
  next_lesson TEXT,
  next_scheduled_date DATE,
  next_scheduled_time TEXT,
  preparation_notes TEXT,
  summary TEXT,
  source TEXT CHECK (source IN ('voice', 'manual')) DEFAULT 'manual',
  transcript TEXT,
  audio_path TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- scheduled_ministry_events (unified calendar)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_ministry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('return_visit', 'bible_study')),
  return_visit_id UUID REFERENCES public.return_visits(id) ON DELETE CASCADE,
  bible_study_id UUID REFERENCES public.bible_studies(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  general_location TEXT,
  topic_or_lesson TEXT,
  preparation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'completed', 'cancelled', 'rescheduled')),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduled_event_link_check CHECK (
    (event_type = 'return_visit' AND return_visit_id IS NOT NULL)
    OR (event_type = 'bible_study' AND bible_study_id IS NOT NULL)
  )
);

-- Triggers
DROP TRIGGER IF EXISTS bible_studies_updated_at ON public.bible_studies;
CREATE TRIGGER bible_studies_updated_at
  BEFORE UPDATE ON public.bible_studies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS bible_study_sessions_updated_at ON public.bible_study_sessions;
CREATE TRIGGER bible_study_sessions_updated_at
  BEFORE UPDATE ON public.bible_study_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS scheduled_ministry_events_updated_at ON public.scheduled_ministry_events;
CREATE TRIGGER scheduled_ministry_events_updated_at
  BEFORE UPDATE ON public.scheduled_ministry_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bible_studies_user_status
  ON public.bible_studies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bible_studies_person
  ON public.bible_studies(person_id);
CREATE INDEX IF NOT EXISTS idx_bible_studies_next
  ON public.bible_studies(user_id, next_study_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_bible_study_sessions_study
  ON public.bible_study_sessions(bible_study_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_bible_study_sessions_user
  ON public.bible_study_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_ministry_events_user_date
  ON public.scheduled_ministry_events(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ministry_events_type
  ON public.scheduled_ministry_events(user_id, event_type, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_ministry_events_person
  ON public.scheduled_ministry_events(person_id);
CREATE INDEX IF NOT EXISTS idx_ministry_events_duplicate_lookup
  ON public.scheduled_ministry_events(
    user_id, person_id, event_type, scheduled_date, scheduled_time
  );

-- RLS
ALTER TABLE public.bible_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_ministry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own bible studies" ON public.bible_studies;
CREATE POLICY "Users manage own bible studies" ON public.bible_studies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own bible study sessions" ON public.bible_study_sessions;
CREATE POLICY "Users manage own bible study sessions" ON public.bible_study_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own ministry events" ON public.scheduled_ministry_events;
CREATE POLICY "Users manage own ministry events" ON public.scheduled_ministry_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Backfill calendar events from existing planned return visits (idempotent)
INSERT INTO public.scheduled_ministry_events (
  user_id,
  person_id,
  event_type,
  return_visit_id,
  scheduled_date,
  scheduled_time,
  general_location,
  topic_or_lesson,
  preparation_notes,
  status,
  is_demo
)
SELECT
  rv.user_id,
  rv.person_id,
  'return_visit',
  rv.id,
  rv.scheduled_date,
  rv.scheduled_time,
  rv.general_location,
  COALESCE(rv.next_planned_topic, rv.last_topic),
  rv.preparation_notes,
  rv.status,
  rv.is_demo
FROM public.return_visits rv
WHERE NOT EXISTS (
  SELECT 1
  FROM public.scheduled_ministry_events e
  WHERE e.return_visit_id = rv.id
);
