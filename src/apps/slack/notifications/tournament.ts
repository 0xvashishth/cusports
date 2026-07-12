import { postToSlackChannel, isChannelAllowed } from "../client"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Tournament, Category } from "@/lib/types"

export async function notifyTournamentCreated(
  orgId: string,
  orgSlug: string,
  tournament: Tournament,
  categories: Category[],
): Promise<boolean> {
  const ac = createAdminClient()

  const { data: integration } = await ac
    .from("org_integrations")
    .select("slack_channel_id, allowed_channel_ids")
    .eq("organization_id", orgId)
    .single()

  if (!integration?.slack_channel_id) return false

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

  return postToSlackChannel(orgId, text, blocks)
}
