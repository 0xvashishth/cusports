-- Allow null player IDs in matches (for bracket slots awaiting previous round winners)
ALTER TABLE matches ALTER COLUMN player_a_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN player_b_id DROP NOT NULL;
