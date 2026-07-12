import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken, postToSlackChannelById } from "@/apps/slack/client"
import { findPlayerBySlackUserId } from "@/apps/slack/validation/players"
import { routeCommand } from "@/apps/slack/commands/router"

export async function POST(request: Request) {
  const body = await request.json()
  const { slack_user_id, opponent_name, games, channel, team_id } = body

  const orgInfo = await lookupOrgBySlackTeam(team_id)
  if (!orgInfo) {
    return NextResponse.json({ error: "Organization not found for this Slack workspace" }, { status: 404 })
  }

  const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
  if (!channelAllowed) {
    return NextResponse.json({ error: "Commands from this channel are not allowed" }, { status: 403 })
  }

  const botToken = await getSlackBotToken(orgInfo.orgId)
  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 500 })
  }

  const reporter = await findPlayerBySlackUserId(orgInfo.orgId, slack_user_id, botToken)
  if (!reporter) {
    return NextResponse.json({ error: "Reporter not linked to any player account" }, { status: 404 })
  }

  const gamesList = (games || []).map((g: { score_a: number; score_b: number }) => ({
    score_a: g.score_a,
    score_b: g.score_b,
  }))

  const commandText = `report match vs ${opponent_name} ${gamesList.map((g: { score_a: number; score_b: number }) => `${g.score_a}-${g.score_b}`).join(", ")}`

  const result = await routeCommand(
    orgInfo.orgId,
    orgInfo.orgSlug,
    orgInfo.orgName,
    slack_user_id,
    channel,
    team_id,
    commandText,
  )

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: result.message })
}
