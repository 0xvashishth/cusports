import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken } from "@/apps/slack/client"
import { findPlayerBySlackUserId } from "@/apps/slack/validation/players"
import { routeCommand } from "@/apps/slack/commands/router"

export async function POST(request: Request) {
  const body = await request.json()
  console.log("[Slack Report Result] Incoming request:", JSON.stringify(body, null, 2))

  const { slack_user_id, opponent_name, games, channel, team_id } = body

  const orgInfo = await lookupOrgBySlackTeam(team_id)
  console.log("[Slack Report Result] Org lookup:", orgInfo)
  if (!orgInfo) {
    return NextResponse.json({ error: "Organization not found for this Slack workspace" }, { status: 404 })
  }

  const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
  console.log("[Slack Report Result] Channel allowed:", channelAllowed)
  if (!channelAllowed) {
    return NextResponse.json({ error: "Commands from this channel are not allowed" }, { status: 403 })
  }

  const botToken = await getSlackBotToken(orgInfo.orgId)
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 500 })
  }

  const reporter = await findPlayerBySlackUserId(orgInfo.orgId, slack_user_id, botToken)
  console.log("[Slack Report Result] Reporter:", reporter)
  if (!reporter) {
    return NextResponse.json({ error: "Reporter not linked to any player account" }, { status: 404 })
  }

  const gamesList = (games || []).map((g: { score_a: number; score_b: number }) => ({
    score_a: g.score_a,
    score_b: g.score_b,
  }))

  const commandText = `report match vs ${opponent_name} ${gamesList.map((g: { score_a: number; score_b: number }) => `${g.score_a}-${g.score_b}`).join(", ")}`
  console.log("[Slack Report Result] Constructed command text:", commandText)

  const result = await routeCommand(
    orgInfo.orgId,
    orgInfo.orgSlug,
    orgInfo.orgName,
    slack_user_id,
    channel,
    team_id,
    commandText,
  )
  console.log("[Slack Report Result] Route command result:", result)

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: result.message })
}
