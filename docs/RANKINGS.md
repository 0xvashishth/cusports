# Ranking & Rating System

## Overview

Cusports uses a standard **ELO rating system** to rank players. Ratings are updated automatically after every completed match — winners gain rating points, losers lose them. The `rankings` table stores per-player, per-category ratings and statistics.

## ELO Model

### Formula

```
Expected score:  E(A) = 1 / (1 + 10^((R(B) - R(A)) / 400))
New rating:      R'(A) = R(A) + K × (S(A) - E(A))
```

Where:
- `R(A)` = current rating of player A
- `R(B)` = current rating of player B
- `S(A)` = actual score (1 for win, 0 for loss)
- `K` = K-factor (development coefficient)
- `400` = rating scale constant

### K-Factor

Players have a **provisional period** of 20 matches where ratings change faster:

| Matches Played | K-Factor |
|---|---|
| ≤ 20 | 32 |
| > 20 | 16 |

This allows new players to quickly reach their true skill level. Both values are configurable via the organization's `ranking_config`.

### Base Rating

All players start at **1000** rating points.

### Example

```
Player A (rating 1200) vs Player B (rating 1000)
Both have played >20 matches (K = 16)

E(A) = 1 / (1 + 10^((1000 - 1200) / 400))
     = 1 / (1 + 10^(-0.5))
     = 1 / (1 + 0.316)
     = 0.76

If A wins:  R'(A) = 1200 + 16 × (1 - 0.76) = 1200 + 4 = 1204
            R'(B) = 1000 + 16 × (0 - 0.24) = 1000 - 4 = 996

If B wins:  R'(A) = 1200 + 16 × (0 - 0.76) = 1200 - 12 = 1188
            R'(B) = 1000 + 16 × (1 - 0.24) = 1000 + 12 = 1012
```

Key insight: the **higher-rated player gains fewer points** when they win (expected outcome) and **loses more points** when they lose (upset).

## Data Model

### Database Table: `rankings`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `organization_id` | uuid | Org scope |
| `category_id` | uuid | Category scope (Men's Singles, etc.) |
| `entity_id` | uuid | Player (or pair) ID |
| `entity_type` | text | `"player"` or `"pair"` |
| `rating` | numeric | Current ELO rating |
| `points` | numeric | Alternative points model (unused in ELO mode) |
| `matches_played` | integer | Total completed matches |
| `wins` | integer | Matches won |
| `losses` | integer | Matches lost |
| `updated_at` | timestamptz | Last update timestamp |

### Unique Constraints

Each player has one ranking row per (organization, category, entity_type) combination.

## How Ratings Update

### Bracket Matches (Tournaments)

When a bracket match result is submitted via `advanceMatch()`:

1. **New match**: delta-based ELO update using current ratings (efficient, O(1))
2. **Edited match**: full category recalculation replays every match in chronological order (correct, handles reversal)
3. **Walkovers**: no rating change (no games were played)
4. **Bye matches**: excluded from rating calculations

### Legacy Matches (Direct Match Entry)

When a manager enters a result through the dashboard:

1. Match is updated with winner and game scores
2. Recalculate API is called with the `matchId`
3. The entire category is recalculated from scratch (all matches replayed)

This approach ensures correctness even when editing previously completed matches.

### Recalculation (Full Replay)

The `recalculateCategory()` function in `src/lib/rankings.ts`:

1. Fetches all completed legacy matches for the category (ordered by `created_at`)
2. Fetches all completed bracket matches for the category (via `tournament_categories` join)
3. Filters out byes and walkovers
4. Sorts all matches chronologically
5. Replays ELO from base rating (1000) for every player
6. Upserts all ranking rows

This guarantees:
- No double-counting from edits
- Consistent ratings regardless of match entry order
- Correct stats (wins, losses, played)

## Organization Configuration

Each organization can customize ELO settings via `organizations.ranking_config`:

```json
{
  "baseRating": 1000,
  "kFactor": 32,
  "kFactorAfterGames": 16,
  "gamesThreshold": 20
}
```

Set via the manager dashboard settings page.

## How Rankings Are Displayed

### Org Public Page (Rankings Tab)

- Each category shows a table of players sorted by rating descending
- **Mixed Singles** tab: combined rankings from all singles categories (Men's + Women's), deduplicated by player keeping highest rating
- **Mixed Doubles** tab: combined rankings from all doubles categories
- Stats columns show Wins, Losses, Played (computed live from match data)
- Only active org members with existing profiles are shown

### Manager Dashboard (Players Page)

- Shows all players in the org with their rating and W-L-Played stats
- Stats are computed live from `matches` + `bracket_matches` tables

### Player Detail Page

- Shows rating history and per-category stats
- Stats include both legacy and bracket matches
- Computed live from match data (not cached in rankings table)

## Recalculate API

### Endpoint

```
POST /api/org/[slug]/rankings/recalculate
```

### Modes

| Mode | Body | Behavior |
|---|---|---|
| Single match | `{ "matchId": "..." }` | Recalculates the category for that match |
| All categories | `{ "mode": "all" }` | Recalculates every category in the org |

### Use Cases

- **After legacy match result**: called automatically by the match entry flow
- **Bulk repair**: if data gets out of sync, call with `mode: "all"` to rebuild everything
- **After data migration**: full recalculate ensures consistency

## Key Files

| File | Purpose |
|---|---|
| `src/lib/elo.ts` | Core ELO math (expected score, K-factor, rating update) |
| `src/lib/rankings.ts` | Recalculation engine + delta update for new matches |
| `src/lib/advance-match.ts` | Bracket match advancement (calls rankings module) |
| `src/app/api/org/[slug]/rankings/recalculate/route.ts` | HTTP API for recalculate |
| `src/app/org/[slug]/page.tsx` | Public page: live stats from match data |
| `src/app/org/[slug]/dashboard/players/page.tsx` | Dashboard: live stats from match data |

## Design Decisions

1. **Live stats override for display**: The org public page and dashboard compute W-L-Played directly from match tables, overriding any stale values in the `rankings` table. This ensures users always see correct counts even if the recalculate endpoint hasn't been called.

2. **Full category recalculate on edit**: When a match is edited, we recalculate the entire category rather than trying to reverse a single result. This is more expensive but guarantees correctness.

3. **Delta update for new matches**: For the common case (new match result), we use an O(1) delta update that just adds the new result to the current ratings. This keeps the system snappy for real-time use.

4. **Doubles not yet supported**: The current system only handles `entity_type: "player"`. Doubles/pairs support would require storing pair-level ratings.
