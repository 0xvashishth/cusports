import { getSlackBotToken } from "../client"
import { findPlayerBySlackUserId } from "../validation/players"
import { isManager } from "../validation/matches"
import { handlePlayerReport } from "./report-match"
import { handleManagerReport } from "./manager-report"
import type { SlackCommandResult } from "../types"

interface ParsedCommand {
  type: "report" | "manager_report" | "walkover" | "help" | "unknown"
  opponentName?: string
  games?: { score_a: number; score_b: number }[]
  playerA?: string
  playerB?: string
}

export function parseCommand(text: string): ParsedCommand {
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim()

  const reportMatch = cleaned.match(
    /report\s+match\s+vs\s+@?(\S+)\s+([\d\-,\s]+)/i,
  )
  if (reportMatch) {
    const opponentName = reportMatch[1].replace(/[>_]/g, "")
    const gamesStr = reportMatch[2]
    const games = gamesStr
      .split(",")
      .map((g) => {
        const parts = g.trim().split("-").map(Number)
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
        return { score_a: parts[0], score_b: parts[1] }
      })
      .filter(Boolean) as { score_a: number; score_b: number }[]

    if (games.length === 0) {
      return { type: "unknown" }
    }

    return { type: "report", opponentName, games }
  }

  const walkoverMatch = cleaned.match(
    /report\s+walkover\s+vs\s+@?(\S+)/i,
  )
  if (walkoverMatch) {
    return { type: "walkover", opponentName: walkoverMatch[1].replace(/[>_]/g, "") }
  }

  const managerReport = cleaned.match(
    /report\s+result\s+@?(\S+)\s+vs\s+@?(\S+)\s+([\d\-,\s]+)/i,
  )
  if (managerReport) {
    const playerA = managerReport[1].replace(/[>_]/g, "")
    const playerB = managerReport[2].replace(/[>_]/g, "")
    const gamesStr = managerReport[3]
    const games = gamesStr
      .split(",")
      .map((g) => {
        const parts = g.trim().split("-").map(Number)
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
        return { score_a: parts[0], score_b: parts[1] }
      })
      .filter(Boolean) as { score_a: number; score_b: number }[]

    if (games.length === 0) return { type: "unknown" }
    return { type: "manager_report", playerA, playerB, games }
  }

  const helpMatch = cleaned.match(/^help$/i)
  if (helpMatch) {
    return { type: "help" }
  }

  return { type: "unknown" }
}

export async function routeCommand(
  orgId: string,
  orgSlug: string,
  orgName: string,
  slackUserId: string,
  channelId: string,
  teamId: string,
  rawText: string,
): Promise<SlackCommandResult> {
  const botToken = await getSlackBotToken(orgId)
  if (!botToken) {
    return { success: false, message: "Bot token not configured for this organization." }
  }

  const parsed = parseCommand(rawText)

  switch (parsed.type) {
    case "report": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      if (!reporter) {
        return { success: false, message: "Your Slack email is not linked to any player account in this organization." }
      }
      return handlePlayerReport(
        orgId, orgSlug, slackUserId,
        parsed.opponentName!, parsed.games!,
        channelId, teamId, botToken,
      )
    }

    case "manager_report": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      if (!reporter) {
        return { success: false, message: "Your Slack email is not linked to any player account." }
      }
      const managerCheck = await isManager(orgId, reporter.id)
      if (!managerCheck) {
        return { success: false, message: "Only managers can use the 'report result @A vs @B' command." }
      }
      return handleManagerReport(
        orgId, orgSlug,
        parsed.playerA!, parsed.playerB!, parsed.games!,
        channelId,
      )
    }

    case "walkover": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      if (!reporter) {
        return { success: false, message: "Your Slack email is not linked to any player account." }
      }
      const managerCheck = await isManager(orgId, reporter.id)
      if (!managerCheck) {
        return { success: false, message: "Only managers can record walkovers." }
      }
      return { success: false, message: "Walkover reporting via Slack is not yet implemented. Please use the dashboard." }
    }

    case "help":
      return {
        success: true,
        message: [
          `*${orgName} Bot Commands*`,
          "",
          "`report match vs @Opponent 11-7, 9-11, 11-5` - Report your match result",
          "`report result @Player1 vs @Player2 11-7, 9-11` - Manager: report any match",
          "`help` - Show this message",
        ].join("\n"),
      }

    default:
      return {
        success: false,
        message: "I didn't understand that command. Try:\n`report match vs @Opponent 11-7, 9-11, 11-5`\nor type `help` for all commands.",
      }
  }
}
