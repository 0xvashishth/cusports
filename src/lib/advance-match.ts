import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_ELO_CONFIG } from "@/lib/elo"
import type { EloConfig } from "@/lib/elo"
import { applyMatchResult, recalculateCategory } from "@/lib/rankings"


interface AdvanceMatchInput {
  bracketMatchId: string
  winnerId: string
  loserId: string
  games: { score_a: number; score_b: number }[]
  reportedVia?: string
}

interface AdvanceMatchOutput {
  success: boolean
  error?: string
}

function getSlotField(slot: string): string {
  return slot === "A" ? "player_a_id" : "player_b_id"
}

function getSlotTypeField(slot: string): string {
  return slot === "A" ? "player_a_type" : "player_b_type"
}

/**
 * Build a reverse wiring map: for each bracket match, count how many
 * other matches wire their winner or loser INTO each slot (A/B).
 */
async function buildWiringMap(
  ac: ReturnType<typeof createAdminClient>,
  categoryId: string,
): Promise<Map<string, { a: number; b: number }>> {
  const { data: allMatches } = await ac
    .from("bracket_matches")
    .select("id, winner_next_match_id, winner_next_slot, loser_next_match_id, loser_next_slot")
    .eq("tournament_category_id", categoryId)

  const map = new Map<string, { a: number; b: number }>()
  if (!allMatches) return map

  for (const m of allMatches) {
    if (m.winner_next_match_id && m.winner_next_slot) {
      const entry = map.get(m.winner_next_match_id) || { a: 0, b: 0 }
      if (m.winner_next_slot === "A") entry.a++
      else entry.b++
      map.set(m.winner_next_match_id, entry)
    }
    if (m.loser_next_match_id && m.loser_next_slot) {
      const entry = map.get(m.loser_next_match_id) || { a: 0, b: 0 }
      if (m.loser_next_slot === "A") entry.a++
      else entry.b++
      map.set(m.loser_next_match_id, entry)
    }
  }

  return map
}

/**
 * Check if a bracket match is a bye (1 player present, empty slot has
 * zero incoming wiring). If so, auto-complete and advance the winner.
 * Handles chains of consecutive byes iteratively.
 */
async function checkAndHandleBye(
  ac: ReturnType<typeof createAdminClient>,
  matchId: string,
  wiringMap: Map<string, { a: number; b: number }>,
): Promise<void> {
  let currentId = matchId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)

    const { data: target } = await ac
      .from("bracket_matches")
      .select("id, player_a_id, player_b_id, status, winner_next_match_id, winner_next_slot")
      .eq("id", currentId)
      .single()

    if (!target || target.status !== "pending") return

    const hasA = !!target.player_a_id
    const hasB = !!target.player_b_id
    if (hasA === hasB) return // Both or neither — not a bye

    const emptySlot = hasA ? "B" : "A"
    const playerId = target.player_a_id || target.player_b_id
    if (!playerId) return

    const wiring = wiringMap.get(currentId) || { a: 0, b: 0 }
    if ((emptySlot === "A" && wiring.a > 0) || (emptySlot === "B" && wiring.b > 0)) {
      return // Opponent expected — not a bye
    }

    // It's a bye — auto-complete and advance
    await ac
      .from("bracket_matches")
      .update({ status: "completed", winner_id: playerId })
      .eq("id", currentId)

    if (!target.winner_next_match_id || !target.winner_next_slot) return

    const slotField = getSlotField(target.winner_next_slot)
    const typeField = getSlotTypeField(target.winner_next_slot)
    await ac
      .from("bracket_matches")
      .update({ [slotField]: playerId, [typeField]: "player" })
      .eq("id", target.winner_next_match_id)

    currentId = target.winner_next_match_id
  }
}

/**
 * Advance a bracket match result by:
 *  1. Updating the match status, winner_id, loser_id
 *  2. replacing games
 *  3. advancing the winner to the next match (populating its slot)
 *  4. activating the next match if both players are present
 *  5. advancing the loser to the loser-bracket match (if any)
 *  6. calculating and persisting ELO ratings
 */
export async function advanceMatch(
  input: AdvanceMatchInput
): Promise<AdvanceMatchOutput> {
  const { bracketMatchId, winnerId, loserId, games } = input
  const isWalkover = games.length === 0
  const newStatus = isWalkover ? "walkover" : "completed"

  const ac = createAdminClient()

  const { data: match, error: matchError } = await ac
    .from("bracket_matches")
    .select(
      "id, player_a_id, player_b_id, status, winner_next_match_id, winner_next_slot, loser_next_match_id, loser_next_slot, tournament_category_id, bracket_side"
    )
    .eq("id", bracketMatchId)
    .single()

  if (matchError || !match) {
    return { success: false, error: "Bracket match not found" }
  }

  const isEditing = match.status === "completed" || match.status === "walkover"

  if (isEditing) {
    // Check that downstream matches haven't been played yet
    for (const nextId of [match.winner_next_match_id, match.loser_next_match_id].filter(Boolean)) {
      const { data: nextMatch } = await ac
        .from("bracket_matches")
        .select("status")
        .eq("id", nextId)
        .single()
      if (nextMatch && (nextMatch.status === "completed" || nextMatch.status === "walkover")) {
        return { success: false, error: "Cannot edit: a downstream match has already been played" }
      }
    }

    // Clear previous advancement from winner's next match
    if (match.winner_next_match_id && match.winner_next_slot) {
      const slotField = getSlotField(match.winner_next_slot)
      await ac
        .from("bracket_matches")
        .update({ [slotField]: null, [`${slotField.replace("_id", "_type")}`]: null })
        .eq("id", match.winner_next_match_id)
      // Reset next match to pending if it was scheduled
      await ac
        .from("bracket_matches")
        .update({ status: "pending" })
        .eq("id", match.winner_next_match_id)
        .eq("status", "scheduled")
    }

    // Clear previous advancement from loser's next match
    if (match.loser_next_match_id && match.loser_next_slot) {
      const slotField = getSlotField(match.loser_next_slot)
      await ac
        .from("bracket_matches")
        .update({ [slotField]: null, [`${slotField.replace("_id", "_type")}`]: null })
        .eq("id", match.loser_next_match_id)
      // Reset next match to pending if it was scheduled
      await ac
        .from("bracket_matches")
        .update({ status: "pending" })
        .eq("id", match.loser_next_match_id)
        .eq("status", "scheduled")
    }
  }

  // Build wiring map for runtime bye detection
  const wiringMap = await buildWiringMap(ac, match.tournament_category_id)

  // 1. Replace game scores FIRST (before updating match status).
  //    If this fails, the match stays in its previous state — no partial writes.
  await ac.from("match_games").delete().eq("bracket_match_id", bracketMatchId)

  if (games.length > 0) {
    const gameInserts = games.map((g, i) => ({
      game_number: i + 1,
      score_a: g.score_a,
      score_b: g.score_b,
      bracket_match_id: bracketMatchId,
    }))
    const { error: insertError } = await ac.from("match_games").insert(gameInserts)

    if (insertError) {
      return { success: false, error: insertError.message }
    }
  }

  // 2. NOW update match status — only after games are safely persisted.
  const { error: updateError } = await ac
    .from("bracket_matches")
    .update({
      status: newStatus,
      winner_id: winnerId,
      loser_id: loserId,
    })
    .eq("id", bracketMatchId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  if (match.winner_next_match_id) {
    const slotField = getSlotField(match.winner_next_slot)
    const typeField = getSlotTypeField(match.winner_next_slot)
    await ac
      .from("bracket_matches")
      .update({ [slotField]: winnerId, [typeField]: "player" })
      .eq("id", match.winner_next_match_id)
    await activateMatchIfNeeded(ac, match.winner_next_match_id)
    await checkAndHandleBye(ac, match.winner_next_match_id, wiringMap)
  }

  if (match.loser_next_slot) {
    const slotField = getSlotField(match.loser_next_slot)
    const typeField = getSlotTypeField(match.loser_next_slot)
    await ac
      .from("bracket_matches")
      .update({ [slotField]: loserId, [typeField]: "player" })
      .eq("id", match.loser_next_match_id)
    await activateMatchIfNeeded(ac, match.loser_next_match_id)
    await checkAndHandleBye(ac, match.loser_next_match_id, wiringMap)
  }

  // Update ELO ratings and rankings
  const tcsData = await ac
    .from("tournament_categories")
    .select("tournament_id, category_id")
    .eq("id", match.tournament_category_id)
    .single()

  if (tcsData.data) {
    const torRes = await ac
      .from("tournaments")
      .select("organization_id")
      .eq("id", tcsData.data.tournament_id)
      .single()

    if (torRes.data) {
      const orgConf = await ac
        .from("organizations")
        .select("ranking_model, ranking_config")
        .eq("id", torRes.data.organization_id)
        .single()

      const cfg: EloConfig = {
        ...DEFAULT_ELO_CONFIG,
        ...(orgConf.data?.ranking_config || {}),
      }

      // Get org ID once
      const orgId = torRes.data.organization_id
      const catId = tcsData.data.category_id

      if (isEditing) {
        // Full category recalculate to correctly handle reversal of old result
        await recalculateCategory(orgId, catId, cfg)
      } else if (!isWalkover) {
        // New match: efficient delta update
        await applyMatchResult(orgId, catId, winnerId, loserId, cfg)
      }
    }

    // Check if tournament should be marked completed
    await checkAndCompleteTournament(ac, tcsData.data.tournament_id)
  }

  return { success: true }
}

async function checkAndCompleteTournament(ac: ReturnType<typeof createAdminClient>, tournamentId: string) {
  const { data: tournament } = await ac
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .single()

  if (tournament?.status === "completed") {
    console.log("[Advance Match] Tournament already completed, skipping:", tournamentId)
    return
  }

  const { data: tcs } = await ac
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", tournamentId)

  if (!tcs || tcs.length === 0) return

  const tcIds = tcs.map((tc: { id: string }) => tc.id)

  const { count: completedCount } = await ac
    .from("bracket_matches")
    .select("id", { count: "exact", head: true })
    .in("tournament_category_id", tcIds)
    .in("status", ["completed", "walkover"])

  const { count: totalCount } = await ac
    .from("bracket_matches")
    .select("id", { count: "exact", head: true })
    .in("tournament_category_id", tcIds)

  if (completedCount != null && totalCount != null && completedCount === totalCount) {
    console.log("[Advance Match] All matches completed, marking tournament as completed:", tournamentId)
    await ac
      .from("tournaments")
      .update({ status: "completed" })
      .eq("id", tournamentId)
  }
}

async function activateMatchIfNeeded(ac: ReturnType<typeof createAdminClient>, nextMatchId: string) {
  const { data: target, error } = await ac
    .from("bracket_matches")
    .select("status, player_a_id, player_b_id")
    .eq("id", nextMatchId)
    .single()

  if (error || !target) return

  if (target.status === "pending" && target.player_a_id && target.player_b_id) {
    await ac
      .from("bracket_matches")
      .update({ status: "scheduled" })
      .eq("id", nextMatchId)
  }
}

/**
 * Activate all pending bracket matches for a tournament category that
 * already have both players present. Returns the count of activated matches.
 */
export async function activatePendingMatches(categoryId: string): Promise<{ activated: number }> {
  const ac = createAdminClient()

  const { data: tc } = await ac
    .from("tournament_categories")
    .select("id")
    .eq("id", categoryId)
    .single()

  if (!tc) return { activated: 0 }

  const { data: pending } = await ac
    .from("bracket_matches")
    .select("id")
    .eq("tournament_category_id", tc.id)
    .eq("status", "pending")
    .not("player_a_id", "is", null)
    .not("player_b_id", "is", null)

  if (!pending || pending.length === 0) return { activated: 0 }

  const ids = pending.map((m: { id: string }) => m.id)
  const { error } = await ac
    .from("bracket_matches")
    .update({ status: "scheduled" })
    .in("id", ids)

  if (error) return { activated: 0 }
  return { activated: ids.length }
}

export async function walkoverMatch(
  bracketMatchId: string,
  winnerId: string,
): Promise<AdvanceMatchOutput> {
  const ac = createAdminClient()
  const { data: match } = await ac
    .from("bracket_matches")
    .select("player_a_id, player_b_id")
    .eq("id", bracketMatchId)
    .single()

  if (!match) return { success: false, error: "Bracket match not found" }

  const loserId = match.player_a_id === winnerId ? match.player_b_id : match.player_a_id
  if (!loserId) return { success: false, error: "Cannot determine loser" }

  return advanceMatch({
    bracketMatchId,
    winnerId,
    loserId,
    games: [],
    reportedVia: "manager",
  })
}
