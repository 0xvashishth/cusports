-- Add ON DELETE CASCADE to all foreign keys so deleting an organization
-- automatically removes all related tournaments, matches, rankings, etc.

-- Helper: drop and recreate each FK with CASCADE
-- organizations children
ALTER TABLE public.org_members
  DROP CONSTRAINT IF EXISTS org_members_organization_id_fkey,
  ADD CONSTRAINT org_members_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_organization_id_fkey,
  ADD CONSTRAINT categories_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_organization_id_fkey,
  ADD CONSTRAINT tournaments_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.rankings
  DROP CONSTRAINT IF EXISTS rankings_organization_id_fkey,
  ADD CONSTRAINT rankings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_organization_id_fkey,
  ADD CONSTRAINT announcements_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.org_integrations
  DROP CONSTRAINT IF EXISTS org_integrations_organization_id_fkey,
  ADD CONSTRAINT org_integrations_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_organization_id_fkey,
  ADD CONSTRAINT activity_log_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- categories children (rankings also refs categories)
ALTER TABLE public.rankings
  DROP CONSTRAINT IF EXISTS rankings_category_id_fkey,
  ADD CONSTRAINT rankings_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

-- tournaments children
ALTER TABLE public.tournament_categories
  DROP CONSTRAINT IF EXISTS tournament_categories_tournament_id_fkey,
  ADD CONSTRAINT tournament_categories_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_entries
  DROP CONSTRAINT IF EXISTS tournament_entries_tournament_id_fkey,
  ADD CONSTRAINT tournament_entries_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- tournament_categories children
ALTER TABLE public.fixtures_config
  DROP CONSTRAINT IF EXISTS fixtures_config_tournament_category_id_fkey,
  ADD CONSTRAINT fixtures_config_tournament_category_id_fkey
    FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE;

ALTER TABLE public.seeds
  DROP CONSTRAINT IF EXISTS seeds_tournament_category_id_fkey,
  ADD CONSTRAINT seeds_tournament_category_id_fkey
    FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE;

ALTER TABLE public.bracket_matches
  DROP CONSTRAINT IF EXISTS bracket_matches_tournament_category_id_fkey,
  ADD CONSTRAINT bracket_matches_tournament_category_id_fkey
    FOREIGN KEY (tournament_category_id) REFERENCES public.tournament_categories(id) ON DELETE CASCADE;

-- bracket_matches self-references (winner/loser next match)
ALTER TABLE public.bracket_matches
  DROP CONSTRAINT IF EXISTS bracket_matches_winner_next_fkey,
  ADD CONSTRAINT bracket_matches_winner_next_fkey
    FOREIGN KEY (winner_next_match_id) REFERENCES public.bracket_matches(id) ON DELETE SET NULL;

ALTER TABLE public.bracket_matches
  DROP CONSTRAINT IF EXISTS bracket_matches_loser_next_fkey,
  ADD CONSTRAINT bracket_matches_loser_next_fkey
    FOREIGN KEY (loser_next_match_id) REFERENCES public.bracket_matches(id) ON DELETE SET NULL;

-- match_games → bracket_matches
ALTER TABLE public.match_games
  DROP CONSTRAINT IF EXISTS match_games_bracket_match_fkey,
  ADD CONSTRAINT match_games_bracket_match_fkey
    FOREIGN KEY (bracket_match_id) REFERENCES public.bracket_matches(id) ON DELETE CASCADE;

-- tournament_categories → categories
ALTER TABLE public.tournament_categories
  DROP CONSTRAINT IF EXISTS tournament_categories_category_id_fkey,
  ADD CONSTRAINT tournament_categories_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;

-- tournament_entries → categories
ALTER TABLE public.tournament_entries
  DROP CONSTRAINT IF EXISTS tournament_entries_category_id_fkey,
  ADD CONSTRAINT tournament_entries_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;
