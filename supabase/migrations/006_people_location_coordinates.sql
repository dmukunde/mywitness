-- Optional GPS coordinates for a person's location pin.
-- Captured only to help reopen the location later (e.g. in a maps app) -
-- never required, never displayed as raw numbers in the UI.
-- Safe to re-run.

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
