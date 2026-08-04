-- Label whether a ministry session came from the live timer or manual entry.
-- Not load-bearing for duration math — used only for UI labeling and to help
-- avoid double-counting when a timer session and a manual edit overlap.
-- Safe to re-run.

ALTER TABLE public.ministry_sessions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('timer', 'manual'));
