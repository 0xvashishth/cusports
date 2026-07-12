-- Drop the legacy matches table. All match data now lives in bracket_matches.
-- match_games.match_id references matches(id), so we drop that column + FK first.

-- 1. Remove the FK constraint and column that reference matches
--    CASCADE drops dependent RLS policies that reference match_id
ALTER TABLE public.match_games DROP CONSTRAINT IF EXISTS match_games_match_id_fkey;
ALTER TABLE public.match_games DROP COLUMN IF EXISTS match_id CASCADE;

-- 2. Drop legacy match result entry endpoint no longer used
-- (the API route /api/org/[slug]/matches/[id]/result is removed in code)

-- 3. Drop the matches table
DROP TABLE IF EXISTS public.matches;
