import { getSlackBotToken } from "../client"
import { findPlayerBySlackUserId } from "../validation/players"
import { isManager } from "../validation/matches"
import { handlePlayerReport } from "./report-match"
import { handleManagerReport } from "./manager-report"
import { handleFixtures } from "./fixtures"
import type { SlackCommandResult } from "../types"

interface ParsedCommand {
  type: "report" | "manager_report" | "walkover" | "fixtures" | "help" | "unknown"
  opponentName?: string
  games?: { score_a: number; score_b: number }[]
  playerA?: string
  playerB?: string
}

export function parseCommand(text: string): ParsedCommand {
  console.log("[Slack Router] parseCommand input:", text)
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim()
  console.log("[Slack Router] Cleaned text:", cleaned)

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
      console.log("[Slack Router] Parsed report but no valid games")
      return { type: "unknown" }
    }

    console.log("[Slack Router] Parsed report match:", { opponentName, games })
    return { type: "report", opponentName, games }
  }

  const walkoverMatch = cleaned.match(
    /report\s+walkover\s+vs\s+@?(\S+)/i,
  )
  if (walkoverMatch) {
    const opponentName = walkoverMatch[1].replace(/[>_]/g, "")
    console.log("[Slack Router] Parsed walkover:", { opponentName })
    return { type: "walkover", opponentName }
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

    if (games.length === 0) {
      console.log("[Slack Router] Parsed manager report but no valid games")
      return { type: "unknown" }
    }
    console.log("[Slack Router] Parsed manager report:", { playerA, playerB, games })
    return { type: "manager_report", playerA, playerB, games }
  }

  const fixturesMatch = cleaned.match(/^fixtures$/i)
  if (fixturesMatch) {
    console.log("[Slack Router] Parsed fixtures command")
    return { type: "fixtures" }
  }

  const helpMatch = cleaned.match(/^help$/i)
  if (helpMatch) {
    console.log("[Slack Router] Parsed help command")
    return { type: "help" }
  }

  console.log("[Slack Router] Command not recognized, returning unknown")
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
  console.log("[Slack Router] routeCommand called:", { orgId, orgSlug, slackUserId, channelId, teamId, rawText })

  const botToken = await getSlackBotToken(orgId)
  if (!botToken) {
    console.log("[Slack Router] No bot token for org:", orgId)
    return { success: false, message: "Bot token not configured for this organization." }
  }

  const parsed = parseCommand(rawText)
  console.log("[Slack Router] Parsed command:", parsed)

  switch (parsed.type) {
    case "report": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      console.log("[Slack Router] Report command - reporter:", reporter)
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
      console.log("[Slack Router] Manager report command - reporter:", reporter)
      if (!reporter) {
        return { success: false, message: "Your Slack email is not linked to any player account." }
      }
      const managerCheck = await isManager(orgId, reporter.id)
      console.log("[Slack Router] Manager check:", managerCheck)
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

    case "fixtures":
      return handleFixtures(orgId)

    case "help":
      return {
        success: true,
        message: [
          `*${orgName} Bot Commands*`,
          "",
          "`fixtures` - Show all upcoming matches with confirmed players",
          "`report match vs @Opponent 11-7, 9-11, 11-5` - Report your match result",
          "`report result @Player1 vs @Player2 11-7, 9-11` - Manager: report any match",
          "`help` - Show this message",
        ].join("\n"),
      }

    default:
      console.log("[Slack Router] Unknown command, raw text:", rawText)
      return {
        success: false,
        message: "I didn't understand that command. Try:\n`report match vs @Opponent 11-7, 9-11, 11-5`\nor type `help` for all commands.",
      }
  }
}
