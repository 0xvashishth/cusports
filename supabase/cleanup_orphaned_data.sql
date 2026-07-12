-- Cleanup script: Remove orphaned data from all tables.
-- Run this after the cascade migration (003) to clean up any rows
-- that were orphaned before cascade rules were in place.

-- 1. bracket_matches whose tournament_category no longer exists
DELETE FROM public.match_games
  WHERE bracket_match_id IN (
    SELECT bm.id FROM public.bracket_matches bm
    LEFT JOIN public.tournament_categories tc ON tc.id = bm.tournament_category_id
    WHERE tc.id IS NULL
  );

DELETE FROM public.bracket_matches
  WHERE tournament_category_id NOT IN (SELECT id FROM public.tournament_categories);

-- 2. tournament_categories whose tournament no longer exists
DELETE FROM public.tournament_categories
  WHERE tournament_id NOT IN (SELECT id FROM public.tournaments);

-- 3. tournament_categories whose category no longer exists
DELETE FROM public.tournament_categories
  WHERE category_id NOT IN (SELECT id FROM public.categories);

-- 4. tournaments whose organization no longer exists
DELETE FROM public.tournaments
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

-- 5. categories whose organization no longer exists
DELETE FROM public.categories
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

-- 6. rankings referencing missing org or category
DELETE FROM public.rankings
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

DELETE FROM public.rankings
  WHERE category_id NOT IN (SELECT id FROM public.categories);

-- 7. org_members referencing missing org or profile
DELETE FROM public.org_members
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

DELETE FROM public.org_members
  WHERE profile_id NOT IN (SELECT id FROM public.profiles);

-- 8. announcements referencing missing org or creator
DELETE FROM public.announcements
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

DELETE FROM public.announcements
  WHERE created_by IS NOT NULL AND created_by NOT IN (SELECT id FROM public.profiles);

-- 9. org_integrations referencing missing org
DELETE FROM public.org_integrations
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

-- 10. activity_log referencing missing org or actor
DELETE FROM public.activity_log
  WHERE organization_id NOT IN (SELECT id FROM public.organizations);

DELETE FROM public.activity_log
  WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM public.profiles);

-- 11. tournament_entries referencing missing tournament, profile, or category
DELETE FROM public.tournament_entries
  WHERE tournament_id NOT IN (SELECT id FROM public.tournaments);

DELETE FROM public.tournament_entries
  WHERE profile_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.tournament_entries
  WHERE category_id NOT IN (SELECT id FROM public.categories);

-- 12. fixtures_config referencing missing tournament_category
DELETE FROM public.fixtures_config
  WHERE tournament_category_id NOT IN (SELECT id FROM public.tournament_categories);

-- 13. seeds referencing missing tournament_category
DELETE FROM public.seeds
  WHERE tournament_category_id NOT IN (SELECT id FROM public.tournament_categories);

-- 14. match_games referencing missing bracket_match
DELETE FROM public.match_games
  WHERE bracket_match_id IS NOT NULL
    AND bracket_match_id NOT IN (SELECT id FROM public.bracket_matches);

-- 15. bracket_matches self-reference cleanup (orphaned next-match links)
UPDATE public.bracket_matches SET winner_next_match_id = NULL
  WHERE winner_next_match_id IS NOT NULL
    AND winner_next_match_id NOT IN (SELECT id FROM public.bracket_matches);

UPDATE public.bracket_matches SET loser_next_match_id = NULL
  WHERE loser_next_match_id IS NOT NULL
    AND loser_next_match_id NOT IN (SELECT id FROM public.bracket_matches);

-- 16. profiles that have no org_members entry and are not admins
-- (Keep profiles that are org creators or platform admins)
DELETE FROM public.profiles
  WHERE id NOT IN (SELECT DISTINCT profile_id FROM public.org_members WHERE profile_id IS NOT NULL)
    AND id NOT IN (SELECT DISTINCT created_by FROM public.organizations WHERE created_by IS NOT NULL)
    AND id NOT IN (SELECT DISTINCT actor_id FROM public.activity_log WHERE actor_id IS NOT NULL)
    AND platform_role = 'player';
