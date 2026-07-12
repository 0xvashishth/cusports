import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken } from "@/apps/slack/client"
import { findPlayerBySlackUserId } from "@/apps/slack/validation/players"
import { routeCommand } from "@/apps/slack/commands/router"

export async function POST(request: Request) {
  const body = await request.json()

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.event?.type === "app_mention") {
    const { text, channel, user } = body.event
    const teamId = body.team_id

    const orgInfo = await lookupOrgBySlackTeam(teamId)
    if (!orgInfo) {
      return NextResponse.json({ ok: true })
    }

    const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
    if (!channelAllowed) {
      return NextResponse.json({ ok: true })
    }

    const botToken = await getSlackBotToken(orgInfo.orgId)
    if (!botToken) {
      return NextResponse.json({ ok: true })
    }

    const reporter = await findPlayerBySlackUserId(orgInfo.orgId, user, botToken)
    if (!reporter) {
      return NextResponse.json({ ok: true })
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

    if (result.message) {
      const { postToSlackChannelById } = await import("@/apps/slack/client")
      await postToSlackChannelById(orgInfo.orgId, channel, result.message)
    }
  }

  return NextResponse.json({ ok: true })
}
