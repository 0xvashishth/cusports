# Tournament Fixture Generation

## Overview

Fixtures (matches) are generated as a **single-elimination knockout bracket**. All rounds are created upfront in one batch operation. Players are seeded by rating using a **snake/serpentine seeding** algorithm so top-rated players are spread across the bracket.

## Flow

```
Manager adds players to categories
  → Manager clicks "Generate Fixtures" 
  → System creates all matches for all rounds at once
  → Top-ranked players get byes (walkovers) if player count is not a power of 2
  → Walkover winners are immediately advanced to the next round
  → Managers enter results round by round
  → Result submission auto-advances winner to next round slot
  → Once all matches in a round are completed, "Next Round" button triggers batch advancement
  → Tournament completes when final match result is entered
```

## Seeding Algorithm

The `seededOrder` function implements a recursive snake-seed system:

```
Input:  [0, 1, 2, 3, 4, 5, 6, 7]  (8 player indices)
Step 1: Split in half, reverse bottom: top=[0,1,2,3], bottom=[7,6,5,4]
Step 2: Interleave: [0,7,1,6,2,5,3,4]
Step 3: Split left/right and recurse on each half
         Left:  [0,7,1,6] → [0,6,7,1]
         Right: [2,5,3,4] → [2,4,5,3]
Final:  [0,6,7,1,2,4,5,3]
```

This produces the standard tennis bracket where:
- #1 seed is at position 0
- #2 seed is at position 7
- #3 seed is at position 4
- etc.

## Bye/Walkover Handling

When player count is not a power of 2:

1. **Bracket size** = next power of 2 ≥ player count
2. **Byes** = bracket size - player count
3. The seeded order is computed for ALL bracket positions
4. Positions beyond the player count are null (byes)
5. Byes are paired with the **top seeds** (highest-ranked players automatically advance)
6. Walkover matches are immediately set to `status: "completed"` with `winner_id` set
7. Walkover winners are pre-filled into the next round's match slots

### Example: 6 players in an 8-bracket

```
Seeded positions: [p1, null, null, p2, p3, p5, p6, p4]

Round 1 (Quarter-finals):
  Match 1: p1 vs BYE  → p1 walkover (completed, advances to SF)
  Match 2: BYE vs p2  → p2 walkover (completed, advances to SF)
  Match 3: p3 vs p5   → scheduled
  Match 4: p6 vs p4   → scheduled

Round 2 (Semi-finals):
  Match 1: p1 vs Winner(Match 3) → TBD until Match 3 result entered
  Match 2: Winner(Match 4) vs p2 → TBD until Match 4 result entered

Round 3 (Final):
  Match 1: Winner(SF1) vs Winner(SF2) → TBD until both semis done
```

## Round Names

Rounds are named based on bracket size:

| Bracket Size | Rounds |
|---|---|
| 2 | Final |
| 4 | Semi-finals, Final |
| 8 | Quarter-finals, Semi-finals, Final |
| 16 | Round of 16, Quarter-finals, Semi-finals, Final |
| 32 | Round of 32, Round of 16, Quarter-finals, Semi-finals, Final |
| 64 | Round of 64, Round of 32, Round of 16, Quarter-finals, Semi-finals, Final |

## Winner Advancement

### Automatic (on result submission)

When a match result is submitted:

1. Match is marked `status: "completed"` with `winner_id` set
2. The winner is placed into the next round's corresponding match slot
   - Match pair (`m*2`, `m*2+1`) in current round feeds into match `m` in next round
   - Even-indexed match → fills `player_a_id` of next match
   - Odd-indexed match → fills `player_b_id` of next match
3. ELO ratings are updated for both players

### Manual (via "Next Round" button)

When all matches in a round are completed but some next-round slots are still TBD:

1. Manager clicks "Next Round" button
2. System finds all completed/walkover matches in the current round
3. Advances each winner to the correct next-round slot
4. If a slot already has a player (from auto-advance), it's not overwritten

## Walkover Resolution During Generation

Walkover matches (byes) are resolved at fixture generation time:

- Walkover match is created with `status: "completed"` and `winner_id` set
- The winner is pre-filled into the next round's slot
- This means top seeds with byes appear directly in round 2

## ELO Ranking Updates

After each completed match:

- Winner's rating increases, loser's decreases (based on K-factor)
- `matches_played`, `wins`, `losses` counters are updated
- Provisional players (≤20 matches) use higher K-factor (32 vs 16)
- Configurable via org's `ranking_config`

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/org/[slug]/tournaments/[id]/generate-fixtures` | Generate all knockout matches |
| POST | `/api/org/[slug]/matches/[id]/result` | Submit match result + advance winner |
| POST | `/api/org/[slug]/tournaments/[id]/advance-round` | Batch-advance all winners to next round |

## Database Tables Involved

- `tournament_entries` — player registrations per category
- `matches` — all match records with status, round, winner
- `match_games` — individual game scores within a match
- `rankings` — player ELO ratings (updated on match completion)
