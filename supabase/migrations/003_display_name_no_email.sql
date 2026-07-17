-- Stop using email local-part as display_name.
-- Safe to re-run. Paste into Supabase → SQL Editor → Run.

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

-- Clear display names that were derived from the email username
UPDATE public.profiles p
SET display_name = NULL,
    updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND p.display_name IS NOT NULL
  AND lower(p.display_name) = lower(split_part(u.email, '@', 1));
