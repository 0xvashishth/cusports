import { advanceMatch } from "@/lib/advance-match"
import { postToSlackChannelById } from "../client"
import { findPlayerBySlackUserId, findPlayerByName, validateBothPlayers } from "../validation/players"
import { findScheduledMatch, validateScores, validateMatchEditable } from "../validation/matches"
import type { SlackCommandResult } from "../types"

export async function handlePlayerReport(
  orgId: string,
  orgSlug: string,
  slackUserId: string,
  opponentName: string,
  games: { score_a: number; score_b: number }[],
  channelId: string,
  teamId: string,
  botToken: string,
): Promise<SlackCommandResult> {
  console.log("[Slack Report] handlePlayerReport:", { orgId, slackUserId, opponentName, games, channelId })

  const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
  if (!reporter) {
    return { success: false, message: "Your Slack email is not linked to any player account in this organization. Please contact a manager." }
  }

  const opponent = await findPlayerByName(orgId, opponentName)
  if (!opponent) {
    return { success: false, message: `Player "${opponentName}" not found. Make sure the full name matches exactly.` }
  }

  if (reporter.id === opponent.id) {
    return { success: false, message: "You cannot report a match against yourself." }
  }

  const playerValidation = await validateBothPlayers(orgId, reporter.id, opponent.id)
  if (!playerValidation.valid) {
    return { success: false, message: playerValidation.error || "Player validation failed" }
  }

  const match = await findScheduledMatch(orgId, reporter.id, opponent.id)
  if (!match) {
    return { success: false, message: `No scheduled match found between you and ${opponent.fullName}. Check your upcoming fixtures.` }
  }

  const scoreValidation = validateScores(games, reporter.id, opponent.id, match)
  if (!scoreValidation.valid) {
    return { success: false, message: scoreValidation.error || "Invalid scores" }
  }

  const editCheck = await validateMatchEditable(match.matchId)
  if (!editCheck.editable) {
    return { success: false, message: editCheck.error || "Match cannot be edited" }
  }

  console.log("[Slack Report] Advancing match:", { matchId: match.matchId, winnerId: scoreValidation.winnerId, loserId: scoreValidation.loserId })
  const result = await advanceMatch({
    bracketMatchId: match.matchId,
    winnerId: scoreValidation.winnerId!,
    loserId: scoreValidation.loserId!,
    games,
    reportedVia: "slack",
  })

  if (!result.success) {
    console.log("[Slack Report] Failed to advance match:", result.error)
    return { success: false, message: `Failed to record result: ${result.error}` }
  }

  const winnerName = scoreValidation.winnerId === reporter.id ? reporter.fullName : opponent.fullName
  const loserName = scoreValidation.winnerId === reporter.id ? opponent.fullName : reporter.fullName
  const scoreStr = games.map((g) => `${g.score_a}-${g.score_b}`).join(", ")
  const matchLabel = [match.tournamentName, match.categoryName].filter(Boolean).join(" - ")

  const message = `Result recorded: ${winnerName} defeated ${loserName} (${scoreStr})${matchLabel ? `\n${matchLabel}` : ""}`

  console.log("[Slack Report] Posting result to channel:", channelId)
  await postToSlackChannelById(orgId, channelId, message)

  return { success: true, message }
}
