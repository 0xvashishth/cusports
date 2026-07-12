import { advanceMatch, walkoverMatch } from "@/lib/advance-match"
import { postToSlackChannelById } from "../client"
import { findPlayerByName, validateBothPlayers } from "../validation/players"
import { findScheduledMatch, findEditableMatch, validateScores, validateMatchEditable } from "../validation/matches"
import type { SlackCommandResult } from "../types"

export async function handleManagerReport(
  orgId: string,
  orgSlug: string,
  reporterName: string,
  opponentName: string,
  games: { score_a: number; score_b: number }[],
  channelId: string,
): Promise<SlackCommandResult> {
  const reporter = await findPlayerByName(orgId, reporterName)
  if (!reporter) {
    return { success: false, message: `Player "${reporterName}" not found. Make sure the full name matches exactly.` }
  }

  const opponent = await findPlayerByName(orgId, opponentName)
  if (!opponent) {
    return { success: false, message: `Player "${opponentName}" not found. Make sure the full name matches exactly.` }
  }

  if (reporter.id === opponent.id) {
    return { success: false, message: "Cannot report a match between the same player." }
  }

  const playerValidation = await validateBothPlayers(orgId, reporter.id, opponent.id)
  if (!playerValidation.valid) {
    return { success: false, message: playerValidation.error || "Player validation failed" }
  }

  const match = await findScheduledMatch(orgId, reporter.id, opponent.id)
  if (!match) {
    return { success: false, message: `No scheduled match found between ${reporter.fullName} and ${opponent.fullName}.` }
  }

  const scoreValidation = validateScores(games, reporter.id, opponent.id, match)
  if (!scoreValidation.valid) {
    return { success: false, message: scoreValidation.error || "Invalid scores" }
  }

  const editCheck = await validateMatchEditable(match.matchId)
  if (!editCheck.editable) {
    return { success: false, message: editCheck.error || "Match cannot be edited" }
  }

  const result = await advanceMatch({
    bracketMatchId: match.matchId,
    winnerId: scoreValidation.winnerId!,
    loserId: scoreValidation.loserId!,
    games,
    reportedVia: "slack",
  })

  if (!result.success) {
    return { success: false, message: `Failed to record result: ${result.error}` }
  }

  const winnerName = scoreValidation.winnerId === reporter.id ? reporter.fullName : opponent.fullName
  const loserName = scoreValidation.winnerId === reporter.id ? opponent.fullName : reporter.fullName
  const scoreStr = games.map((g) => `${g.score_a}-${g.score_b}`).join(", ")
  const matchLabel = [match.tournamentName, match.categoryName].filter(Boolean).join(" - ")

  const message = `Result recorded (by manager): ${winnerName} defeated ${loserName} (${scoreStr})${matchLabel ? `\n${matchLabel}` : ""}`

  await postToSlackChannelById(orgId, channelId, message)

  return { success: true, message }
}

export async function handleManagerWalkover(
  orgId: string,
  winnerName: string,
  loserName: string,
  channelId: string,
): Promise<SlackCommandResult> {
  const winner = await findPlayerByName(orgId, winnerName)
  if (!winner) {
    return { success: false, message: `Player "${winnerName}" not found.` }
  }

  const loser = await findPlayerByName(orgId, loserName)
  if (!loser) {
    return { success: false, message: `Player "${loserName}" not found.` }
  }

  const playerValidation = await validateBothPlayers(orgId, winner.id, loser.id)
  if (!playerValidation.valid) {
    return { success: false, message: playerValidation.error || "Player validation failed" }
  }

  const match = await findScheduledMatch(orgId, winner.id, loser.id)
  if (!match) {
    return { success: false, message: `No scheduled match found between ${winner.fullName} and ${loser.fullName}.` }
  }

  const result = await walkoverMatch(match.matchId, winner.id)

  if (!result.success) {
    return { success: false, message: `Failed to record walkover: ${result.error}` }
  }

  const message = `Walkover recorded: ${winner.fullName} wins by walkover over ${loser.fullName}`

  await postToSlackChannelById(orgId, channelId, message)

  return { success: true, message }
}
