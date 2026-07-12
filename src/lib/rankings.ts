import { createAdminClient } from "@/lib/supabase/admin"
import { calculateMatchResult, DEFAULT_ELO_CONFIG } from "@/lib/elo"
import type { EloConfig } from "@/lib/elo"

interface PlayerState {
  rating: number
  matches_played: number
  wins: number
  losses: number
}

interface MatchEvent {
  player_a: string
  player_b: string
  winner: string
  created_at: string
}

/**
 * Recalculate all ELO ratings and stats for a given category by replaying
 * every completed match in chronological order. This produces correct
 * ratings regardless of match editing history.
 *
 * Walkovers and byes are excluded from rating/stats calculation.
 */
export async function recalculateCategory(
  orgId: string,
  categoryId: string,
  cfg: EloConfig = DEFAULT_ELO_CONFIG
): Promise<{ updated: number; players: number }> {
  const ac = createAdminClient()

  // 1. Fetch completed bracket matches via tournament_categories
  const { data: tcData } = await ac
    .from("tournament_categories")
    .select("id")
    .eq("category_id", categoryId)

  let bracketMatches: { player_a_id: string | null; player_b_id: string | null; winner_id: string | null; is_bye: boolean; created_at: string }[] = []
  if (tcData && tcData.length > 0) {
    const tcIds = tcData.map((tc: { id: string }) => tc.id)
    const { data: bm } = await ac
      .from("bracket_matches")
      .select("player_a_id, player_b_id, winner_id, is_bye, created_at")
      .in("tournament_category_id", tcIds)
      .eq("status", "completed")
      .not("winner_id", "is", null)
      .order("created_at", { ascending: true })
    bracketMatches = (bm || []) as typeof bracketMatches
  }

  // 2. Build events from bracket matches
  const events: MatchEvent[] = bracketMatches
    .filter((m) => !m.is_bye && m.player_a_id && m.player_b_id)
    .map((m) => ({
      player_a: m.player_a_id as string,
      player_b: m.player_b_id as string,
      winner: m.winner_id as string,
      created_at: m.created_at,
    }))

  if (events.length === 0) {
    return { updated: 0, players: 0 }
  }

  // 4. Replay ELO in order
  const states = new Map<string, PlayerState>()

  function getState(playerId: string): PlayerState {
    return states.get(playerId) ?? {
      rating: cfg.baseRating,
      matches_played: 0,
      wins: 0,
      losses: 0,
    }
  }

  for (const event of events) {
    const isWinnerA = event.winner === event.player_a
    const winnerId = isWinnerA ? event.player_a : event.player_b
    const loserId = isWinnerA ? event.player_b : event.player_a

    const winnerState = getState(winnerId)
    const loserState = getState(loserId)

    const { winnerNewRating, loserNewRating } = calculateMatchResult(
      winnerState.rating,
      loserState.rating,
      winnerState.matches_played,
      loserState.matches_played,
      cfg
    )

    states.set(winnerId, {
      rating: winnerNewRating,
      matches_played: winnerState.matches_played + 1,
      wins: winnerState.wins + 1,
      losses: winnerState.losses,
    })

    states.set(loserId, {
      rating: loserNewRating,
      matches_played: loserState.matches_played + 1,
      wins: loserState.wins,
      losses: loserState.losses + 1,
    })
  }

  // 5. Upsert ranking rows
  let updated = 0
  for (const [entityId, state] of states) {
    const { data: existing } = await ac
      .from("rankings")
      .select("id")
      .eq("organization_id", orgId)
      .eq("category_id", categoryId)
      .eq("entity_id", entityId)
      .eq("entity_type", "player")
      .maybeSingle()

    const payload = {
      organization_id: orgId,
      category_id: categoryId,
      entity_id: entityId,
      entity_type: "player" as const,
      rating: state.rating,
      matches_played: state.matches_played,
      wins: state.wins,
      losses: state.losses,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      await ac.from("rankings").update(payload).eq("id", existing.id)
    } else {
      await ac.from("rankings").insert(payload)
    }
    updated++
  }

  return { updated, players: states.size }
}

/**
 * Legacy delta-based ELO update for a single match result.
 * Used for new (non-edit) bracket matches in advanceMatch for efficiency.
 * Only call this when you know the match is a NEW result (not an edit).
 */
export async function applyMatchResult(
  orgId: string,
  categoryId: string,
  winnerId: string,
  loserId: string,
  cfg: EloConfig = DEFAULT_ELO_CONFIG
): Promise<void> {
  const ac = createAdminClient()

  const [winnerRanking, loserRanking] = await Promise.all([
    ac
      .from("rankings")
      .select("*")
      .eq("organization_id", orgId)
      .eq("category_id", categoryId)
      .eq("entity_id", winnerId)
      .eq("entity_type", "player")
      .maybeSingle(),
    ac
      .from("rankings")
      .select("*")
      .eq("organization_id", orgId)
      .eq("category_id", categoryId)
      .eq("entity_id", loserId)
      .eq("entity_type", "player")
      .maybeSingle(),
  ])

  const wRating = (winnerRanking.data?.rating ?? cfg.baseRating) as number
  const lRating = (loserRanking.data?.rating ?? cfg.baseRating) as number
  const wPlayed = (winnerRanking.data?.matches_played ?? 0) as number
  const lPlayed = (loserRanking.data?.matches_played ?? 0) as number

  const { winnerNewRating, loserNewRating } = calculateMatchResult(
    wRating,
    lRating,
    wPlayed,
    lPlayed,
    cfg
  )

  const upsertRanking = async (
    entityId: string,
    data: {
      rating: number
      matches_played: number
      wins: number
      losses: number
    }
  ) => {
    const existing =
      entityId === winnerId ? winnerRanking.data : loserRanking.data

    const payload = {
      organization_id: orgId,
      category_id: categoryId,
      entity_id: entityId,
      entity_type: "player" as const,
      rating: data.rating,
      matches_played: data.matches_played,
      wins: data.wins,
      losses: data.losses,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      await ac.from("rankings").update(payload).eq("id", (existing as { id: string }).id)
    } else {
      await ac.from("rankings").insert(payload)
    }
  }

  await Promise.all([
    upsertRanking(winnerId, {
      rating: Math.round(winnerNewRating),
      matches_played: wPlayed + 1,
      wins: (winnerRanking.data?.wins ?? 0) + 1,
      losses: winnerRanking.data?.losses ?? 0,
    }),
    upsertRanking(loserId, {
      rating: Math.round(loserNewRating),
      matches_played: lPlayed + 1,
      wins: loserRanking.data?.wins ?? 0,
      losses: (loserRanking.data?.losses ?? 0) + 1,
    }),
  ])
}
