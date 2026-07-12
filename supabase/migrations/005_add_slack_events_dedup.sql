-- Slack event deduplication table.
-- Each incoming Slack event has a unique event_id that stays the same across
-- retries. We insert it before processing; ON CONFLICT ensures exactly-once
-- handling even when Slack retries due to slow responses.

CREATE TABLE public.slack_events (
  event_id    text NOT NULL PRIMARY KEY,
  team_id     text NOT NULL,
  channel_id  text NOT NULL,
  user_id     text NOT NULL,
  event_type  text NOT NULL,
  raw_json    jsonb,
  created_at  timestamp with time zone DEFAULT now()
);

ALTER TABLE public.slack_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on slack_events"
  ON public.slack_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for cleanup queries (delete events older than N days)
CREATE INDEX idx_slack_events_created_at ON public.slack_events (created_at);
