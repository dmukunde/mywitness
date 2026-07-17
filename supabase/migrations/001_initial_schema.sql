-- MyWitness initial schema
-- Run this in the Supabase SQL Editor or via supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  keep_audio_after_transcription BOOLEAN NOT NULL DEFAULT FALSE,
  browser_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_minutes_before INTEGER NOT NULL DEFAULT 60,
  demo_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- People
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  general_location TEXT,
  preferred_contact_time TEXT,
  first_met_date DATE,
  interest_level TEXT CHECK (interest_level IN ('unknown', 'low', 'moderate', 'high', 'very_high')),
  current_discussion_theme TEXT,
  key_questions TEXT,
  private_notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ministry sessions
CREATE TABLE IF NOT EXISTS ministry_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  session_date DATE NOT NULL,
  ministry_type TEXT CHECK (ministry_type IN (
    'house_to_house', 'public_witnessing', 'informal_witnessing',
    'return_visits', 'bible_studies', 'letter_writing',
    'telephone_witnessing', 'other'
  )),
  companion TEXT,
  area TEXT,
  personal_reflection TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ministry_sessions(id) ON DELETE SET NULL,
  conversation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approximate_time TEXT,
  general_location TEXT,
  how_met TEXT,
  main_topic TEXT,
  questions_asked TEXT,
  concerns_circumstances TEXT,
  publications_shared TEXT,
  interest_level TEXT CHECK (interest_level IN ('unknown', 'low', 'moderate', 'high', 'very_high')),
  promised_follow_up_date DATE,
  promised_follow_up_time TEXT,
  next_topic TEXT,
  action_required TEXT,
  additional_notes TEXT,
  summary TEXT,
  next_visit_preparation TEXT,
  source TEXT CHECK (source IN ('voice', 'manual')) DEFAULT 'manual',
  audio_path TEXT,
  keep_audio BOOLEAN NOT NULL DEFAULT FALSE,
  transcript TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation scriptures
CREATE TABLE IF NOT EXISTS conversation_scriptures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scripture_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Return visits
CREATE TABLE IF NOT EXISTS return_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled', 'rescheduled')),
  last_topic TEXT,
  question_to_answer TEXT,
  next_planned_topic TEXT,
  general_location TEXT,
  preparation_notes TEXT,
  completed_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_visit_id UUID REFERENCES return_visits(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN (
    'return_visit', 'overdue', 'preparation', 'unsaved_recording', 'follow_up'
  )),
  title TEXT NOT NULL,
  body TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER people_updated_at BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ministry_sessions_updated_at BEFORE UPDATE ON ministry_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER return_visits_updated_at BEFORE UPDATE ON return_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile + settings on signup
-- SECURITY DEFINER + fixed search_path so Auth can insert into public tables safely.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'display_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_people_user_id ON people(user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_people_name ON people(user_id, name);
CREATE INDEX IF NOT EXISTS idx_people_search ON people USING gin (
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(general_location,'') || ' ' ||
    coalesce(current_discussion_theme,'') || ' ' || coalesce(key_questions,'') || ' ' || coalesce(private_notes,''))
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_person_id ON conversations(person_id);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(user_id, conversation_date DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_search ON conversations USING gin (
  to_tsvector('english', coalesce(main_topic,'') || ' ' || coalesce(questions_asked,'') || ' ' ||
    coalesce(general_location,'') || ' ' || coalesce(additional_notes,'') || ' ' || coalesce(summary,''))
);

CREATE INDEX IF NOT EXISTS idx_return_visits_user_date ON return_visits(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_return_visits_status ON return_visits(user_id, status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_return_visits_person ON return_visits(person_id);

CREATE INDEX IF NOT EXISTS idx_ministry_sessions_user_date ON ministry_sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_user_due ON reminders(user_id, due_at) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scriptures_conversation ON conversation_scriptures(conversation_id);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_scriptures ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Settings policies
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- People policies
CREATE POLICY "Users manage own people" ON people
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversations policies
CREATE POLICY "Users manage own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Scriptures policies
CREATE POLICY "Users manage own scriptures" ON conversation_scriptures
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Return visits policies
CREATE POLICY "Users manage own return visits" ON return_visits
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ministry sessions policies
CREATE POLICY "Users manage own sessions" ON ministry_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reminders policies
CREATE POLICY "Users manage own reminders" ON reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for temporary audio
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'conversation-audio',
  'conversation-audio',
  false,
  26214400,
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'conversation-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'conversation-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'conversation-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
