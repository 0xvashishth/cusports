import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken } from "@/apps/slack/client"
import { findPlayerBySlackUserId } from "@/apps/slack/validation/players"
import { routeCommand } from "@/apps/slack/commands/router"

export async function POST(request: Request) {
  const body = await request.json()

  console.log("[Slack Events] Incoming request:", JSON.stringify(body, null, 2))

  if (body.type === "url_verification") {
    console.log("[Slack Events] URL verification challenge, responding with:", body.challenge)
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.event?.type === "app_mention") {
    const { text, channel, user } = body.event
    const teamId = body.team_id

    console.log("[Slack Events] App mention received:", { text, channel, user, teamId })

    const orgInfo = await lookupOrgBySlackTeam(teamId)
    console.log("[Slack Events] Org lookup result:", orgInfo)
    if (!orgInfo) {
      console.log("[Slack Events] No org found for team_id:", teamId, "- returning ok")
      return NextResponse.json({ ok: true })
    }

    const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
    console.log("[Slack Events] Channel allowed:", channelAllowed, "for channel:", channel)
    if (!channelAllowed) {
      console.log("[Slack Events] Channel NOT allowed, ignoring")
      return NextResponse.json({ ok: true })
    }

    const botToken = await getSlackBotToken(orgInfo.orgId)
    console.log("[Slack Events] Bot token found:", !!botToken)
    if (!botToken) {
      console.log("[Slack Events] No bot token configured for org:", orgInfo.orgId)
      return NextResponse.json({ ok: true })
    }

    const reporter = await findPlayerBySlackUserId(orgInfo.orgId, user, botToken)
    console.log("[Slack Events] Reporter lookup:", reporter)
    if (!reporter) {
      console.log("[Slack Events] No player linked to Slack user:", user)
      return NextResponse.json({ ok: true })
    }

    console.log("[Slack Events] Routing command:", { orgId: orgInfo.orgId, orgSlug: orgInfo.orgSlug, user, channel, text })
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

    if (result.message) {
      console.log("[Slack Events] Posting response to channel:", channel)
      const { postToSlackChannelById } = await import("@/apps/slack/client")
      const postResult = await postToSlackChannelById(orgInfo.orgId, channel, result.message)
      console.log("[Slack Events] Post result:", postResult)
    }
  } else {
    console.log("[Slack Events] Non-mention event, event type:", body.event?.type || "none")
  }

  return NextResponse.json({ ok: true })
}
