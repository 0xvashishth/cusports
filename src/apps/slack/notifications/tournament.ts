import { postToSlackChannel, isChannelAllowed } from "../client"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Tournament, Category } from "@/lib/types"

export async function notifyTournamentCreated(
  orgId: string,
  orgSlug: string,
  tournament: Tournament,
  categories: Category[],
): Promise<boolean> {
  console.log("[Slack Notifications] notifyTournamentCreated called:", { orgId, orgSlug, tournamentName: tournament.name })

  const ac = createAdminClient()

  const { data: integration, error } = await ac
    .from("org_integrations")
    .select("slack_channel_id, allowed_channel_ids, slack_team_id, slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  console.log("[Slack Notifications] Integration fetch:", {
    hasIntegration: !!integration,
    hasChannelId: !!integration?.slack_channel_id,
    hasTeamId: !!integration?.slack_team_id,
    hasBotToken: !!integration?.slack_bot_token_encrypted,
    allowedChannels: integration?.allowed_channel_ids,
    error: error?.message,
  })

  if (!integration?.slack_channel_id) {
    console.log("[Slack Notifications] No slack_channel_id configured, skipping notification")
    return false
  }

  if (!integration.slack_bot_token_encrypted) {
    console.log("[Slack Notifications] No bot token configured, skipping notification")
    return false
  }

  if (integration.allowed_channel_ids && integration.allowed_channel_ids.length > 0) {
    const allowed = await isChannelAllowed(orgId, integration.slack_channel_id)
    console.log("[Slack Notifications] Channel allowed check:", allowed)
    if (!allowed) {
      console.log("[Slack Notifications] Default channel not in allowlist, skipping")
      return false
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const tournamentUrl = `${siteUrl}/org/${orgSlug}/tournaments/${tournament.id}`

  const categoryNames = categories.map((c) => c.name).join(", ") || "None"
  const startDate = new Date(tournament.start_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
  const endDate = new Date(tournament.end_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })

  const text = `New Tournament Created: ${tournament.name}`

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `New Tournament: ${tournament.name}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Dates:*\n${startDate} - ${endDate}` },
        { type: "mrkdwn", text: `*Categories:*\n${categoryNames}` },
      ],
    },
    ...(tournament.venue ? [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Venue:* ${tournament.venue}` },
      },
    ] : []),
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Status:* ${tournament.status}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Tournament", emoji: true },
          url: tournamentUrl,
          style: "primary",
        },
      ],
    },
  ]

  console.log("[Slack Notifications] Sending tournament notification to channel:", integration.slack_channel_id)
  const result = await postToSlackChannel(orgId, text, blocks)
  console.log("[Slack Notifications] Tournament notification result:", result)
  return result
}

export async function notifyTournamentPublished(
  orgId: string,
  orgSlug: string,
  tournament: Tournament,
  categories: Category[],
): Promise<boolean> {
  console.log("[Slack Notifications] notifyTournamentPublished called:", { orgId, orgSlug, tournamentName: tournament.name })

  const ac = createAdminClient()

  const { data: integration, error } = await ac
    .from("org_integrations")
    .select("slack_channel_id, allowed_channel_ids, slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  console.log("[Slack Notifications] Integration fetch for publish:", {
    hasIntegration: !!integration,
    hasChannelId: !!integration?.slack_channel_id,
    hasBotToken: !!integration?.slack_bot_token_encrypted,
    error: error?.message,
  })

  if (!integration?.slack_channel_id) {
    console.log("[Slack Notifications] No slack_channel_id, skipping publish notification")
    return false
  }

  if (!integration.slack_bot_token_encrypted) {
    console.log("[Slack Notifications] No bot token, skipping publish notification")
    return false
  }

  if (integration.allowed_channel_ids && integration.allowed_channel_ids.length > 0) {
    const allowed = await isChannelAllowed(orgId, integration.slack_channel_id)
    if (!allowed) return false
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const tournamentUrl = `${siteUrl}/org/${orgSlug}/tournaments/${tournament.id}`

  const categoryNames = categories.map((c) => c.name).join(", ") || "None"
  const startDate = new Date(tournament.start_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
  const endDate = new Date(tournament.end_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })

  const text = `Tournament Published: ${tournament.name}`

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `Tournament Published: ${tournament.name}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The tournament *${tournament.name}* has been published and is now visible to all players!`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Dates:*\n${startDate} - ${endDate}` },
        { type: "mrkdwn", text: `*Categories:*\n${categoryNames}` },
      ],
    },
    ...(tournament.venue ? [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Venue:* ${tournament.venue}` },
      },
    ] : []),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Tournament", emoji: true },
          url: tournamentUrl,
          style: "primary",
        },
      ],
    },
  ]

  console.log("[Slack Notifications] Sending publish notification to channel:", integration.slack_channel_id)
  const result = await postToSlackChannel(orgId, text, blocks)
  console.log("[Slack Notifications] Publish notification result:", result)
  return result
}

export interface CategoryWinner {
  categoryName: string
  winnerName: string
  runnerUpName: string | null
  thirdPlaceName: string | null
}

export async function notifyTournamentCompleted(
  orgId: string,
  orgSlug: string,
  tournament: Tournament,
  winners: CategoryWinner[],
): Promise<boolean> {
  console.log("[Slack Notifications] notifyTournamentCompleted called:", { orgId, orgSlug, tournamentName: tournament.name, winners })

  const ac = createAdminClient()

  const { data: integration, error } = await ac
    .from("org_integrations")
    .select("slack_channel_id, allowed_channel_ids, slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  console.log("[Slack Notifications] Integration fetch for completion:", {
    hasIntegration: !!integration,
    hasChannelId: !!integration?.slack_channel_id,
    hasBotToken: !!integration?.slack_bot_token_encrypted,
    error: error?.message,
  })

  if (!integration?.slack_channel_id) {
    console.log("[Slack Notifications] No slack_channel_id, skipping completion notification")
    return false
  }

  if (!integration.slack_bot_token_encrypted) {
    console.log("[Slack Notifications] No bot token, skipping completion notification")
    return false
  }

  if (integration.allowed_channel_ids && integration.allowed_channel_ids.length > 0) {
    const allowed = await isChannelAllowed(orgId, integration.slack_channel_id)
    if (!allowed) return false
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const tournamentUrl = `${siteUrl}/org/${orgSlug}/tournaments/${tournament.id}`

  const startDate = new Date(tournament.start_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })
  const endDate = new Date(tournament.end_date).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })

  const text = `Tournament Completed: ${tournament.name}`

  const winnersText = winners.length > 0
    ? winners.map((w) => {
        const lines = [`*${w.categoryName}*`]
        if (w.winnerName !== "TBD") lines.push(`  :gold: 1st: ${w.winnerName}`)
        else lines.push(`  1st: TBD`)
        if (w.runnerUpName) lines.push(`  :silver: 2nd: ${w.runnerUpName}`)
        if (w.thirdPlaceName) lines.push(`  :third_place_medal: 3rd: ${w.thirdPlaceName}`)
        return lines.join("\n")
      }).join("\n\n")
    : "No results recorded."

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `Tournament Completed: ${tournament.name}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The tournament *${tournament.name}* has been completed!`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Dates:*\n${startDate} - ${endDate}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Results:*\n${winnersText}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Tournament", emoji: true },
          url: tournamentUrl,
          style: "primary",
        },
      ],
    },
  ]

  console.log("[Slack Notifications] Sending completion notification to channel:", integration.slack_channel_id)
  const result = await postToSlackChannel(orgId, text, blocks)
  console.log("[Slack Notifications] Completion notification result:", result)
  return result
}
