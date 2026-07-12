import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken, addReaction, postToSlackChannelById } from "@/apps/slack/client"
import { findPlayerBySlackUserId } from "@/apps/slack/validation/players"
import { routeCommand, parseCommand } from "@/apps/slack/commands/router"

export async function POST(request: Request) {
  const body = await request.json()

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.event?.type === "app_mention") {
    processEvent(body).catch((err) => {
      console.error("[Slack Events] Background processing error:", err)
    })
  }

  return NextResponse.json({ ok: true })
}

async function processEvent(body: Record<string, unknown>) {
  const event = body.event as Record<string, unknown>
  const { text, channel, user, ts: eventTimestamp } = event as {
    text: string
    channel: string
    user: string
    ts: string
  }
  const teamId = body.team_id as string

  console.log("[Slack Events] Processing event:", { text, channel, user, teamId })

  const orgInfo = await lookupOrgBySlackTeam(teamId)
  if (!orgInfo) {
    console.log("[Slack Events] No org found for team_id:", teamId)
    return
  }

  const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
  if (!channelAllowed) {
    console.log("[Slack Events] Channel NOT allowed, ignoring")
    return
  }

  const botToken = await getSlackBotToken(orgInfo.orgId)
  if (!botToken) {
    console.log("[Slack Events] No bot token configured for org:", orgInfo.orgId)
    return
  }

  const parsed = parseCommand(text)
  const needsReporter = parsed.type === "report" || parsed.type === "manager_report" || parsed.type === "walkover"

  if (needsReporter) {
    const reporter = await findPlayerBySlackUserId(orgInfo.orgId, user, botToken)
    if (!reporter) {
      console.log("[Slack Events] No player linked to Slack user:", user)
      await postToSlackChannelById(orgInfo.orgId, channel,
        "Your Slack email is not linked to any player account. Please make sure your profile email matches your player account.")
      return
    }
  }

  const result = await routeCommand(
    orgInfo.orgId,
    orgInfo.orgSlug,
    orgInfo.orgName,
    user,
    channel,
    teamId,
    text,
  )
  console.log("[Slack Events] Command result:", result)

  if (result.reaction && eventTimestamp) {
    await addReaction(orgInfo.orgId, channel, eventTimestamp, result.reaction)
  }

  if (result.replyMessage) {
    await postToSlackChannelById(orgInfo.orgId, channel, result.replyMessage)
  }
}
