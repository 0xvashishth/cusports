-- Add 'in_progress' to tournament status lifecycle.
-- Status flow: draft → published → in_progress → completed
--
-- The CHECK constraint must be dropped and recreated because PostgreSQL
-- does not support ALTER CONSTRAINT.

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'in_progress'::text, 'completed'::text]));

-- Add slack_notification_ts column if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'slack_notification_ts'
  ) THEN
    ALTER TABLE public.tournaments ADD COLUMN slack_notification_ts text;
  END IF;
END $$;
