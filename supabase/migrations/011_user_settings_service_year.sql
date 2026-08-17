-- Configurable service-year start month for ministry-time year totals.
-- Defaults to September (the JW service-year convention) but the user can
-- change it in Settings; 1 (January) gives an ordinary calendar year.
-- Safe to re-run.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS service_year_start_month INTEGER NOT NULL DEFAULT 9
  CHECK (service_year_start_month BETWEEN 1 AND 12);
