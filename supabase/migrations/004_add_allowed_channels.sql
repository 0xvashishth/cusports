-- Add allowed_channel_ids to org_integrations for channel allowlist.
-- Score reports and commands are only processed from these channels.
-- If empty, all channels are allowed.

ALTER TABLE public.org_integrations
  ADD COLUMN IF NOT EXISTS allowed_channel_ids text[] DEFAULT '{}';
