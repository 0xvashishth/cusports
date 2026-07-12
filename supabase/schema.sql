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
  CONSTRAINT org_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT org_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
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
CREATE TABLE public.match_games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_number integer NOT NULL,
  score_a integer NOT NULL,
  score_b integer NOT NULL,
  bracket_match_id uuid,
  CONSTRAINT match_games_pkey PRIMARY KEY (id),
  CONSTRAINT match_games_bracket_match_fkey FOREIGN KEY (bracket_match_id) REFERENCES public.bracket_matches(id)
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
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
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
  CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id),
  CONSTRAINT activity_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.tournament_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid,
  profile_id uuid,
  category_id uuid,
  seed integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tournament_entries_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_entries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT tournament_entries_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT tournament_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.fixtures_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL UNIQUE,
  bracket_type text NOT NULL CHECK (bracket_type = ANY (ARRAY['single_elimination'::text, 'double_elimination'::text])),
  seeding_method text NOT NULL DEFAULT 'ranked'::text CHECK (seeding_method = ANY (ARRAY['ranked'::text, 'random'::text, 'manual'::text])),
  bye_handling text NOT NULL DEFAULT 'top_seeds_get_byes'::text CHECK (bye_handling = ANY (ARRAY['top_seeds_get_byes'::text, 'random_byes'::text])),
  third_place_match boolean DEFAULT false,
  grand_final_mode text NOT NULL DEFAULT 'true_double_elim_reset'::text CHECK (grand_final_mode = ANY (ARRAY['single_final'::text, 'true_double_elim_reset'::text])),
  generated_at timestamp with time zone,
  CONSTRAINT fixtures_config_pkey PRIMARY KEY (id),
  CONSTRAINT fixtures_config_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id)
);
CREATE TABLE public.seeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['player'::text, 'pair'::text])),
  seed_number integer NOT NULL,
  CONSTRAINT seeds_pkey PRIMARY KEY (id),
  CONSTRAINT seeds_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id)
);
CREATE TABLE public.bracket_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL,
  bracket_side text NOT NULL CHECK (bracket_side = ANY (ARRAY['winners'::text, 'losers'::text, 'grand_final'::text, 'grand_final_reset'::text, 'third_place'::text, 'single'::text])),
  round_number integer NOT NULL,
  match_index integer NOT NULL,
  player_a_id uuid,
  player_a_type text CHECK (player_a_type = ANY (ARRAY['player'::text, 'pair'::text])),
  player_b_id uuid,
  player_b_type text CHECK (player_b_type = ANY (ARRAY['player'::text, 'pair'::text])),
  is_bye boolean DEFAULT false,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'ongoing'::text, 'completed'::text, 'walkover'::text, 'cancelled'::text])),
  winner_id uuid,
  loser_id uuid,
  winner_next_match_id uuid,
  winner_next_slot text CHECK (winner_next_slot = ANY (ARRAY['A'::text, 'B'::text])),
  loser_next_match_id uuid,
  loser_next_slot text CHECK (loser_next_slot = ANY (ARRAY['A'::text, 'B'::text])),
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bracket_matches_pkey PRIMARY KEY (id),
  CONSTRAINT bracket_matches_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id),
  CONSTRAINT bracket_matches_winner_next_fkey FOREIGN KEY (winner_next_match_id) REFERENCES public.bracket_matches(id),
  CONSTRAINT bracket_matches_loser_next_fkey FOREIGN KEY (loser_next_match_id) REFERENCES public.bracket_matches(id)
);
