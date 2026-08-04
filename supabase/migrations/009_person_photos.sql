-- Waypoint-style photos per person: a small ordered list (not a full gallery)
-- to help relocate a specific house/gate/landmark down unmarked or winding
-- roads. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.person_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  photo_path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_person_photos_person
  ON public.person_photos(person_id, sort_order);

ALTER TABLE public.person_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own person photos" ON public.person_photos;
CREATE POLICY "Users manage own person photos" ON public.person_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for person photos (private, per-user folder policies mirror
-- the existing conversation-audio bucket).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'person-photos',
  'person-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own person photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'person-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own person photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'person-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own person photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'person-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
