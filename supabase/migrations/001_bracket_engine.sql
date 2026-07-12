-- Migration: Fixtures & Bracket Engine
-- Adds fixtures_config, seeds, bracket_matches tables
-- Adds bracket_match_id to match_games for bracket play

-- 1. fixtures_config: per-category bracket configuration
CREATE TABLE IF NOT EXISTS public.fixtures_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL UNIQUE,
  bracket_type text NOT NULL CHECK (bracket_type IN ('single_elimination','double_elimination')),
  seeding_method text NOT NULL DEFAULT 'ranked' CHECK (seeding_method IN ('ranked','random','manual')),
  bye_handling text NOT NULL DEFAULT 'top_seeds_get_byes' CHECK (bye_handling IN ('top_seeds_get_byes','random_byes')),
  third_place_match boolean DEFAULT false,
  grand_final_mode text NOT NULL DEFAULT 'true_double_elim_reset' CHECK (grand_final_mode IN ('single_final','true_double_elim_reset')),
  generated_at timestamp with time zone,
  CONSTRAINT fixtures_config_pkey PRIMARY KEY (id),
  CONSTRAINT fixtures_config_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE
);

-- 2. seeds: player/pair seeding order per category
CREATE TABLE IF NOT EXISTS public.seeds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('player','pair')),
  seed_number int NOT NULL,
  CONSTRAINT seeds_pkey PRIMARY KEY (id),
  CONSTRAINT seeds_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE,
  CONSTRAINT seeds_unique_seed UNIQUE (tournament_category_id, seed_number)
);

-- 3. bracket_matches: explicit bracket graph structure
CREATE TABLE IF NOT EXISTS public.bracket_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_category_id uuid NOT NULL,
  bracket_side text NOT NULL CHECK (bracket_side IN ('winners','losers','grand_final','grand_final_reset','third_place','single')),
  round_number int NOT NULL,
  match_index int NOT NULL,
  player_a_id uuid,
  player_a_type text CHECK (player_a_type IN ('player','pair')),
  player_b_id uuid,
  player_b_type text CHECK (player_b_type IN ('player','pair')),
  is_bye boolean DEFAULT false,
  status text DEFAULT 'pending' CHECK (status IN ('pending','scheduled','ongoing','completed','walkover','cancelled')),
  winner_id uuid,
  loser_id uuid,
  winner_next_match_id uuid,
  winner_next_slot text CHECK (winner_next_slot IN ('A','B')),
  loser_next_match_id uuid,
  loser_next_slot text CHECK (loser_next_slot IN ('A','B')),
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bracket_matches_pkey PRIMARY KEY (id),
  CONSTRAINT bracket_matches_tournament_category_id_fkey FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE,
  CONSTRAINT bracket_matches_winner_next_fkey FOREIGN KEY (winner_next_match_id) REFERENCES public.bracket_matches(id),
  CONSTRAINT bracket_matches_loser_next_fkey FOREIGN KEY (loser_next_match_id) REFERENCES public.bracket_matches(id)
);

-- 4. Add bracket_match_id to match_games (links game scores to bracket matches)
ALTER TABLE public.match_games ADD COLUMN IF NOT EXISTS bracket_match_id uuid;
ALTER TABLE public.match_games ADD CONSTRAINT match_games_bracket_match_fkey
  FOREIGN KEY (bracket_match_id) REFERENCES public.bracket_matches(id) ON DELETE CASCADE;

-- 5. RLS policies for new tables
ALTER TABLE public.fixtures_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_matches ENABLE ROW LEVEL SECURITY;

-- Public read for active org's fixtures
CREATE POLICY "Public read fixtures_config" ON public.fixtures_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tournament_categories tc
      JOIN public.tournaments t ON t.id = tc.tournament_id
      JOIN public.organizations o ON o.id = t.organization_id
      WHERE tc.id = fixtures_config.tournament_category_id
      AND o.is_active = true
      AND t.status IN ('published','completed')
    )
  );

CREATE POLICY "Public read seeds" ON public.seeds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tournament_categories tc
      JOIN public.tournaments t ON t.id = tc.tournament_id
      JOIN public.organizations o ON o.id = t.organization_id
      WHERE tc.id = seeds.tournament_category_id
      AND o.is_active = true
      AND t.status IN ('published','completed')
    )
  );

CREATE POLICY "Public read bracket_matches" ON public.bracket_matches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tournament_categories tc
      JOIN public.tournaments t ON t.id = tc.tournament_id
      JOIN public.organizations o ON o.id = t.organization_id
      WHERE tc.id = bracket_matches.tournament_category_id
      AND o.is_active = true
      AND t.status IN ('published','completed')
    )
  );
