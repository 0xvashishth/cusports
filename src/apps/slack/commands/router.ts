import { getSlackBotToken } from "../client"
import { findPlayerBySlackUserId } from "../validation/players"
import { isManager } from "../validation/matches"
import { handlePlayerReport } from "./report-match"
import { handleManagerReport } from "./manager-report"
import { handleFixtures } from "./fixtures"
import { handleRankings } from "./rankings"
import type { SlackCommandResult } from "../types"

interface ParsedCommand {
  type: "report" | "manager_report" | "walkover" | "fixtures" | "rankings" | "help" | "unknown"
  opponentName?: string
  opponentSlackUserId?: string
  games?: { score_a: number; score_b: number }[]
  playerA?: string
  playerASlackUserId?: string
  playerB?: string
  playerBSlackUserId?: string
}

function parseGames(gamesStr: string): { score_a: number; score_b: number }[] {
  return gamesStr
    .split(",")
    .map((g) => {
      const parts = g.trim().split("-").map(Number)
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null
      return { score_a: parts[0], score_b: parts[1] }
    })
    .filter(Boolean) as { score_a: number; score_b: number }[]
}

export function parseCommand(text: string): ParsedCommand {
  console.log("[Slack Router] parseCommand input:", text)

  const mentionRe = /<@([A-Z0-9]+)>/g
  const mentionIds: string[] = []
  let m: RegExpExecArray | null
  while ((m = mentionRe.exec(text)) !== null) {
    mentionIds.push(m[1])
  }
  console.log("[Slack Router] Mention IDs found:", mentionIds)

  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim()
  console.log("[Slack Router] Cleaned text:", cleaned)

  const reportMatchRaw = text.match(
    /report\s+match\s+(?:vs\s+)?<@([A-Z0-9]+)>\s+([\d\-,\s]+)/i,
  )
  if (reportMatchRaw) {
    const opponentSlackUserId = reportMatchRaw[1]
    const games = parseGames(reportMatchRaw[2])
    if (games.length === 0) {
      console.log("[Slack Router] Parsed report (raw mention) but no valid games")
      return { type: "unknown" }
    }
    console.log("[Slack Router] Parsed report match (raw mention):", { opponentSlackUserId, games })
    return { type: "report", opponentSlackUserId, games }
  }

  const reportMatchCleaned = cleaned.match(
    /report\s+match\s+(?:vs\s+)?@?(\S+)\s+([\d\-,\s]+)/i,
  )
  if (reportMatchCleaned) {
    const opponentName = reportMatchCleaned[1].replace(/[>_]/g, "")
    const games = parseGames(reportMatchCleaned[2])
    if (games.length === 0) {
      console.log("[Slack Router] Parsed report (name) but no valid games")
      return { type: "unknown" }
    }
    console.log("[Slack Router] Parsed report match (name):", { opponentName, games })
    return { type: "report", opponentName, games }
  }

  const walkoverRaw = text.match(
    /report\s+walkover\s+(?:vs\s+)?<@([A-Z0-9]+)>/i,
  )
  if (walkoverRaw) {
    console.log("[Slack Router] Parsed walkover (raw mention):", { opponentSlackUserId: walkoverRaw[1] })
    return { type: "walkover", opponentSlackUserId: walkoverRaw[1] }
  }

  const walkoverMatch = cleaned.match(
    /report\s+walkover\s+(?:vs\s+)?@?(\S+)/i,
  )
  if (walkoverMatch) {
    const opponentName = walkoverMatch[1].replace(/[>_]/g, "")
    console.log("[Slack Router] Parsed walkover (name):", { opponentName })
    return { type: "walkover", opponentName }
  }

  const managerReportRaw = text.match(
    /report\s+result\s+<@([A-Z0-9]+)>\s+(?:vs\s+)?<@([A-Z0-9]+)>\s+([\d\-,\s]+)/i,
  )
  if (managerReportRaw) {
    const playerASlackUserId = managerReportRaw[1]
    const playerBSlackUserId = managerReportRaw[2]
    const games = parseGames(managerReportRaw[3])
    if (games.length === 0) {
      console.log("[Slack Router] Parsed manager report (raw mention) but no valid games")
      return { type: "unknown" }
    }
    console.log("[Slack Router] Parsed manager report (raw mention):", { playerASlackUserId, playerBSlackUserId, games })
    return { type: "manager_report", playerASlackUserId, playerBSlackUserId, games }
  }

  const managerReportCleaned = cleaned.match(
    /report\s+result\s+@?(\S+)\s+vs\s+@?(\S+)\s+([\d\-,\s]+)/i,
  )
  if (managerReportCleaned) {
    const playerA = managerReportCleaned[1].replace(/[>_]/g, "")
    const playerB = managerReportCleaned[2].replace(/[>_]/g, "")
    const games = parseGames(managerReportCleaned[3])
    if (games.length === 0) {
      console.log("[Slack Router] Parsed manager report (name) but no valid games")
      return { type: "unknown" }
    }
    console.log("[Slack Router] Parsed manager report (name):", { playerA, playerB, games })
    return { type: "manager_report", playerA, playerB, games }
  }

  const fixturesMatch = cleaned.match(/^fixtures$/i)
  if (fixturesMatch) {
    console.log("[Slack Router] Parsed fixtures command")
    return { type: "fixtures" }
  }

  const rankingsMatch = cleaned.match(/^rankings$/i)
  if (rankingsMatch) {
    console.log("[Slack Router] Parsed rankings command")
    return { type: "rankings" }
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
    return { success: false, replyMessage: "Bot token not configured for this organization." }
  }

  const parsed = parseCommand(rawText)
  console.log("[Slack Router] Parsed command:", parsed)

  switch (parsed.type) {
    case "report": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      console.log("[Slack Router] Report command - reporter:", reporter)
      if (!reporter) {
        return { success: false, replyMessage: "Your Slack email is not linked to any player account in this organization. Please make sure your Slack profile has your email set and it matches your player account." }
      }

      let opponent: { id: string; fullName: string } | null = null
      if (parsed.opponentSlackUserId) {
        opponent = await findPlayerBySlackUserId(orgId, parsed.opponentSlackUserId, botToken)
        console.log("[Slack Router] Opponent lookup by Slack user ID:", opponent)
        if (!opponent) {
          return { success: false, replyMessage: "The mentioned opponent's Slack email is not linked to any player account in this organization." }
        }
      } else if (parsed.opponentName) {
        const { findPlayerByName } = await import("../validation/players")
        opponent = await findPlayerByName(orgId, parsed.opponentName)
        console.log("[Slack Router] Opponent lookup by name:", opponent)
        if (!opponent) {
          return { success: false, replyMessage: `Player "${parsed.opponentName}" not found. Make sure the full name matches exactly.` }
        }
      }

      if (!opponent) {
        return { success: false, replyMessage: "Could not identify the opponent. Please mention them with @username." }
      }

      return handlePlayerReport(
        orgId, orgSlug, slackUserId,
        opponent.fullName, parsed.games!,
        channelId, teamId, botToken,
      )
    }

    case "manager_report": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      console.log("[Slack Router] Manager report command - reporter:", reporter)
      if (!reporter) {
        return { success: false, replyMessage: "Your Slack email is not linked to any player account." }
      }
      const managerCheck = await isManager(orgId, reporter.id)
      console.log("[Slack Router] Manager check:", managerCheck)
      if (!managerCheck) {
        return { success: false, replyMessage: "Only managers can use the 'report result @A vs @B' command." }
      }

      let playerAName = parsed.playerA
      if (parsed.playerASlackUserId) {
        const playerA = await findPlayerBySlackUserId(orgId, parsed.playerASlackUserId, botToken)
        if (!playerA) return { success: false, replyMessage: "The first mentioned player's Slack email is not linked to any player account." }
        playerAName = playerA.fullName
      }

      let playerBName = parsed.playerB
      if (parsed.playerBSlackUserId) {
        const playerB = await findPlayerBySlackUserId(orgId, parsed.playerBSlackUserId, botToken)
        if (!playerB) return { success: false, replyMessage: "The second mentioned player's Slack email is not linked to any player account." }
        playerBName = playerB.fullName
      }

      if (!playerAName || !playerBName) {
        return { success: false, replyMessage: "Could not identify both players. Please mention them with @username." }
      }

      return handleManagerReport(
        orgId, orgSlug,
        playerAName, playerBName, parsed.games!,
        channelId,
      )
    }

    case "walkover": {
      const reporter = await findPlayerBySlackUserId(orgId, slackUserId, botToken)
      if (!reporter) {
        return { success: false, replyMessage: "Your Slack email is not linked to any player account." }
      }
      const managerCheck = await isManager(orgId, reporter.id)
      if (!managerCheck) {
        return { success: false, replyMessage: "Only managers can record walkovers." }
      }
      return { success: false, replyMessage: "Walkover reporting via Slack is not yet implemented. Please use the dashboard." }
    }

    case "fixtures":
      return handleFixtures(orgId)

    case "rankings":
      return handleRankings(orgId)

    case "help":
      return {
        success: true,
        replyMessage: [
          `*${orgName} Bot Commands*`,
          "",
          "`fixtures` - Show all upcoming matches with confirmed players",
          "`rankings` - Show player rankings for all categories",
          "`report match vs @Opponent 11-7, 9-11, 11-5` - Report your match result",
          "`report result @Player1 vs @Player2 11-7, 9-11` - Manager: report any match",
          "`help` - Show this message",
        ].join("\n"),
      }

    default:
      console.log("[Slack Router] Unknown command, raw text:", rawText)
      return {
        success: false,
        replyMessage: "I didn't understand that command. Try:\n`report match vs @Opponent 11-7, 9-11, 11-5`\nor type `help` for all commands.",
      }
  }
}
