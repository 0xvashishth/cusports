-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  email text UNIQUE,
  platform_role text DEFAULT 'player'::text CHECK (platform_role = ANY (ARRAY['admin'::text, 'manager'::text, 'player'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  banner_url text,
  theme jsonb DEFAULT '{}'::jsonb,
  ranking_model text DEFAULT 'elo'::text CHECK (ranking_model = ANY (ARRAY['elo'::text, 'points'::text])),
  ranking_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id),
  CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.org_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  profile_id uuid,
  org_role text NOT NULL CHECK (org_role = ANY (ARRAY['manager'::text, 'player'::text])),
  status text DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['invited'::text, 'active'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT org_members_pkey PRIMARY KEY (id),
  CONSTRAINT org_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT org_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  is_doubles boolean DEFAULT false,
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.rankings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  category_id uuid,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['player'::text, 'pair'::text])),
  rating numeric,
  points numeric,
  matches_played integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rankings_pkey PRIMARY KEY (id),
  CONSTRAINT rankings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT rankings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  banner_url text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  venue text,
  status text DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'completed'::text])),
  CONSTRAINT tournaments_pkey PRIMARY KEY (id),
  CONSTRAINT tournaments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.tournament_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid,
  category_id uuid,
  points_per_game integer DEFAULT 11,
  games_per_match integer DEFAULT 5,
  win_by_two boolean DEFAULT true,
  format_type text DEFAULT 'knockout'::text CHECK (format_type = ANY (ARRAY['knockout'::text, 'round_robin'::text, 'group_knockout'::text])),
  CONSTRAINT tournament_categories_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_categories_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT tournament_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  tournament_id uuid,
  category_id uuid,
  round text,
  player_a_id uuid NOT NULL,
  player_b_id uuid NOT NULL,
  scheduled_at timestamp with time zone,
  status text DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'ongoing'::text, 'completed'::text, 'walkover'::text, 'cancelled'::text])),
  winner_id uuid,
  reported_via text DEFAULT 'manager'::text CHECK (reported_via = ANY (ARRAY['manager'::text, 'slack'::text, 'player'::text])),
  approval_status text DEFAULT 'n/a'::text CHECK (approval_status = ANY (ARRAY['n/a'::text, 'pending'::text, 'approved'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT matches_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.match_games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid,
  game_number integer NOT NULL,
  score_a integer NOT NULL,
  score_b integer NOT NULL,
  CONSTRAINT match_games_pkey PRIMARY KEY (id),
  CONSTRAINT match_games_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  link_url text,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  created_by uuid,
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.org_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  slack_team_id text,
  slack_channel_id text,
  slack_bot_token_encrypted text,
  CONSTRAINT org_integrations_pkey PRIMARY KEY (id),
  CONSTRAINT org_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_id uuid,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.tournament_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid,
  profile_id uuid,
  category_id uuid,
  seed integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tournament_entries_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT tournament_entries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT tournament_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);