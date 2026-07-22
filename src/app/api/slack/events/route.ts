import { NextResponse } from "next/server"
import { lookupOrgBySlackTeam, isChannelAllowed, getSlackBotToken, addReaction, postToSlackChannelById } from "@/apps/slack/client"
import { routeCommand } from "@/apps/slack/commands/router"
import { handleReactionAdded, handleReactionRemoved } from "@/apps/slack/notifications/tournament-reactions"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const body = await request.json()

  console.log("[Slack Events] Incoming request:", JSON.stringify(body, null, 2))

  if (body.type === "url_verification") {
    console.log("[Slack Events] URL verification challenge")
    return NextResponse.json({ challenge: body.challenge })
  }

  const eventType = body.event?.type
  const teamId = body.team_id as string
  const eventId = body.event_id as string

  const orgInfo = await lookupOrgBySlackTeam(teamId)
  if (!orgInfo) {
    console.log("[Slack Events] No org found for team_id:", teamId)
    return NextResponse.json({ ok: true })
  }

  const channel = eventType === "app_mention"
    ? body.event.channel
    : body.event.item?.channel

  if (!channel) {
    console.log("[Slack Events] No channel found in event, ignoring")
    return NextResponse.json({ ok: true })
  }

  const channelAllowed = await isChannelAllowed(orgInfo.orgId, channel)
  console.log("[Slack Events] Channel allowed:", channelAllowed, "for channel:", channel)
  if (!channelAllowed) {
    console.log("[Slack Events] Channel NOT allowed, ignoring event:", eventId)
    return NextResponse.json({ ok: true })
  }

  const ac = createAdminClient()
  const { error: insertErr } = await ac
    .from("slack_events")
    .insert({
      event_id: eventId,
      team_id: teamId,
      channel_id: channel,
      user_id: body.event.user,
      event_type: eventType,
      raw_json: body,
    })

  if (insertErr) {
    if (insertErr.code === "23505") {
      console.log("[Slack Events] Duplicate event, skipping:", eventId)
      return NextResponse.json({ ok: true })
    }
    console.error("[Slack Events] Failed to insert event for dedup:", insertErr.message)
    return NextResponse.json({ ok: true })
  }

  console.log("[Slack Events] New event recorded, processing:", eventId)

  const botToken = await getSlackBotToken(orgInfo.orgId)
  if (!botToken) {
    console.log("[Slack Events] No bot token configured for org:", orgInfo.orgId)
    return NextResponse.json({ ok: true })
  }

  if (eventType === "reaction_added" || eventType === "reaction_removed") {
    const { reaction, user, item } = body.event
    const messageTs = item?.ts

    console.log("[Slack Events] Reaction event:", { eventType, eventId, reaction, user, messageTs, channel, teamId })

    if (eventType === "reaction_added") {
      await handleReactionAdded(orgInfo.orgId, orgInfo.orgSlug, user, reaction, messageTs, botToken)
    } else {
      await handleReactionRemoved(orgInfo.orgId, user, reaction, messageTs, botToken)
    }
  } else if (eventType === "app_mention") {
    const { text, user, ts: eventTimestamp } = body.event

    console.log("[Slack Events] App mention:", { eventId, text, channel, user, teamId })

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

    if (result.reaction && eventTimestamp) {
      console.log("[Slack Events] Adding reaction:", result.reaction, "to channel:", channel, "timestamp:", eventTimestamp)
      const reactionResult = await addReaction(orgInfo.orgId, channel, eventTimestamp, result.reaction)
      console.log("[Slack Events] Reaction result:", reactionResult)
    }

    if (result.replyMessage) {
      console.log("[Slack Events] Posting reply to channel:", channel)
      const postResult = await postToSlackChannelById(orgInfo.orgId, channel, result.replyMessage)
      console.log("[Slack Events] Post result:", postResult)
    }
  } else {
    console.log("[Slack Events] Unhandled event type:", eventType || "none")
  }

  return NextResponse.json({ ok: true })
}
