import { createAdminClient } from "@/lib/supabase/admin"
import type { ResolvedMatch, ScoreValidation } from "../types"

/**
 * Find a scheduled bracket match between two players.
 * Uses correct query: finds matches where the pair of player IDs matches.
 */
export async function findScheduledMatch(
  orgId: string,
  playerAId: string,
  playerBId: string,
): Promise<ResolvedMatch | null> {
  console.log("[Slack Matches] findScheduledMatch:", { orgId, playerAId, playerBId })
  const ac = createAdminClient()

  const playerIds = [playerAId, playerBId]

  const { data: matches, error } = await ac
    .from("bracket_matches")
    .select("id, tournament_category_id, player_a_id, player_b_id, status, is_bye")
    .in("status", ["scheduled", "ongoing"])
    .eq("is_bye", false)

  console.log("[Slack Matches] Bracket matches found:", { count: matches?.length, error: error?.message })

  if (!matches) return null

  const match = matches.find((m) => {
    const hasA = playerIds.includes(m.player_a_id)
    const hasB = playerIds.includes(m.player_b_id)
    return hasA && hasB && m.player_a_id !== m.player_b_id
  })

  console.log("[Slack Matches] Match found between players:", match?.id || "none")

  if (!match) return null

  const { data: tc, error: tcErr } = await ac
    .from("tournament_categories")
    .select("id, tournament_id, category_id, tournament:tournaments(name), category:categories(name)")
    .eq("id", match.tournament_category_id)
    .single()

  console.log("[Slack Matches] Tournament category lookup:", { tc, error: tcErr?.message })

  if (!tc) return null

  const tournament = tc.tournament as unknown as { name: string } | null
  const category = tc.category as unknown as { name: string } | null

  const result = {
    matchId: match.id,
    tournamentCategoryId: match.tournament_category_id,
    playerAId: match.player_a_id,
    playerBId: match.player_b_id,
    status: match.status,
    tournamentName: tournament?.name || null,
    categoryName: category?.name || null,
  }
  console.log("[Slack Matches] Resolved match:", result)
  return result
}

/**
 * Find any bracket match (for editing) between two players.
 */
export async function findEditableMatch(
  orgId: string,
  playerAId: string,
  playerBId: string,
): Promise<ResolvedMatch | null> {
  console.log("[Slack Matches] findEditableMatch:", { orgId, playerAId, playerBId })
  const ac = createAdminClient()

  const playerIds = [playerAId, playerBId]

  const { data: matches, error } = await ac
    .from("bracket_matches")
    .select("id, tournament_category_id, player_a_id, player_b_id, status, is_bye")
    .in("status", ["scheduled", "ongoing", "completed", "walkover"])
    .eq("is_bye", false)

  console.log("[Slack Matches] Editable matches found:", { count: matches?.length, error: error?.message })

  if (!matches) return null

  const match = matches.find((m) => {
    const hasA = playerIds.includes(m.player_a_id)
    const hasB = playerIds.includes(m.player_b_id)
    return hasA && hasB && m.player_a_id !== m.player_b_id
  })

  if (!match) return null

  const { data: tc } = await ac
    .from("tournament_categories")
    .select("id, tournament_id, category_id, tournament:tournaments(name), category:categories(name)")
    .eq("id", match.tournament_category_id)
    .single()

  if (!tc) return null

  const tournament = tc.tournament as unknown as { name: string } | null
  const category = tc.category as unknown as { name: string } | null

  return {
    matchId: match.id,
    tournamentCategoryId: match.tournament_category_id,
    playerAId: match.player_a_id,
    playerBId: match.player_b_id,
    status: match.status,
    tournamentName: tournament?.name || null,
    categoryName: category?.name || null,
  }
}

/**
 * Validate game scores. Determines winner based on games won.
 */
export function validateScores(
  games: { score_a: number; score_b: number }[],
  reporterId: string,
  opponentId: string,
  match: ResolvedMatch,
): ScoreValidation {
  console.log("[Slack Matches] validateScores:", { games, reporterId, opponentId, matchId: match.matchId })

  if (!games || games.length === 0) {
    return { valid: false, error: "No game scores provided. Use 'report walkover' for walkovers.", gameWins: { a: 0, b: 0 } }
  }

  for (const game of games) {
    if (typeof game.score_a !== "number" || typeof game.score_b !== "number") {
      return { valid: false, error: "All scores must be numbers", gameWins: { a: 0, b: 0 } }
    }
    if (game.score_a < 0 || game.score_b < 0) {
      return { valid: false, error: "Scores cannot be negative", gameWins: { a: 0, b: 0 } }
    }
    if (game.score_a === game.score_b) {
      return { valid: false, error: `Game ${games.indexOf(game) + 1} is tied — each game must have a winner`, gameWins: { a: 0, b: 0 } }
    }
  }

  const reporterWins = games.filter((g) => g.score_a > g.score_b).length
  const opponentWins = games.filter((g) => g.score_b > g.score_a).length

  if (reporterWins === opponentWins) {
    return { valid: false, error: "The match is tied — one player must win more games", gameWins: { a: reporterWins, b: opponentWins } }
  }

  const winnerId = reporterWins > opponentWins ? reporterId : opponentId
  const loserId = winnerId === reporterId ? opponentId : reporterId

  const result = {
    valid: true,
    winnerId,
    loserId,
    gameWins: { a: reporterWins, b: opponentWins },
  }
  console.log("[Slack Matches] Score validation result:", result)
  return result
}

/**
 * Check if downstream matches have been played (prevents editing).
 */
export async function validateMatchEditable(matchId: string): Promise<{ editable: boolean; error?: string }> {
  console.log("[Slack Matches] validateMatchEditable:", matchId)
  const ac = createAdminClient()

  const { data: match } = await ac
    .from("bracket_matches")
    .select("winner_next_match_id, loser_next_match_id")
    .eq("id", matchId)
    .single()

  if (!match) return { editable: false, error: "Match not found" }

  const nextIds = [match.winner_next_match_id, match.loser_next_match_id].filter(Boolean)
  if (nextIds.length === 0) return { editable: true }

  const { data: nextMatches } = await ac
    .from("bracket_matches")
    .select("id, status")
    .in("id", nextIds)

  const played = (nextMatches || []).filter(
    (m) => m.status === "completed" || m.status === "walkover",
  )

  if (played.length > 0) {
    console.log("[Slack Matches] Match not editable - downstream matches played:", played.length)
    return { editable: false, error: "Cannot edit: a downstream match has already been played" }
  }

  return { editable: true }
}

/**
 * Check if a user is a manager or admin in the org.
 */
export async function isManager(orgId: string, profileId: string): Promise<boolean> {
  console.log("[Slack Matches] isManager check:", { orgId, profileId })
  const ac = createAdminClient()

  const { data: profile } = await ac
    .from("profiles")
    .select("platform_role")
    .eq("id", profileId)
    .single()

  if (profile?.platform_role === "admin") {
    console.log("[Slack Matches] User is platform admin")
    return true
  }

  const { data: member } = await ac
    .from("org_members")
    .select("org_role")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .single()

  const result = member?.org_role === "manager"
  console.log("[Slack Matches] Manager check result:", result, "org_role:", member?.org_role)
  return result
}
