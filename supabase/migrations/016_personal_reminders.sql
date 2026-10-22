-- Personal reminders ("remind me to ...") and the device subscriptions that
-- let the server send them as push notifications.
--
-- Separate from return visits and Bible studies: a reminder needs no visit
-- or study, a contact can have many, and a reminder can have no contact at
-- all. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.personal_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  -- The exact moment to be reminded (stored in UTC; shown in local time).
  due_at TIMESTAMPTZ NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'weekly', 'monthly')),
  -- When the push for the current due_at was sent. Claimed atomically, so a
  -- reminder is announced once even if two sender runs overlap.
  notified_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  last_done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS personal_reminders_updated_at ON public.personal_reminders;
CREATE TRIGGER personal_reminders_updated_at
  BEFORE UPDATE ON public.personal_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Moving a reminder to a new time (snooze, reschedule, or the next occurrence
-- of a repeating one) re-arms its notification.
CREATE OR REPLACE FUNCTION public.rearm_reminder_on_reschedule()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    NEW.notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personal_reminders_rearm ON public.personal_reminders;
CREATE TRIGGER personal_reminders_rearm
  BEFORE UPDATE ON public.personal_reminders
  FOR EACH ROW EXECUTE FUNCTION public.rearm_reminder_on_reschedule();

CREATE INDEX IF NOT EXISTS idx_personal_reminders_user_open
  ON public.personal_reminders(user_id, due_at)
  WHERE done_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_reminders_to_send
  ON public.personal_reminders(due_at)
  WHERE done_at IS NULL AND dismissed_at IS NULL AND notified_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_reminders_person
  ON public.personal_reminders(person_id);

-- The same reminder (same contact, same words, same moment) can't exist twice
-- while open — a double tap or a retry can never double it.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_personal_reminders_open
  ON public.personal_reminders (
    user_id,
    COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(text)),
    due_at
  )
  WHERE done_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE public.personal_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own personal reminders" ON public.personal_reminders;
CREATE POLICY "Users manage own personal reminders" ON public.personal_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Supabase stops granting Data API access to new tables automatically from
-- 2026-10-30, so say it explicitly. Row-level security (above) still decides
-- which rows anyone can touch; the signed-out role gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_reminders TO service_role;

-- One row per device that agreed to receive notifications.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- When on, the notification says only "You have a reminder" — no names or
  -- details on the lock screen.
  private_mode BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
