import { postToSlackChannelById, isChannelAllowed } from "../client"
import { createAdminClient } from "@/lib/supabase/admin"

export async function postAnnouncementToSlack(
  orgId: string,
  channelId: string,
  title: string,
  body: string,
  linkUrl?: string | null,
): Promise<boolean> {
  console.log("[Slack Notifications] postAnnouncementToSlack called:", { orgId, channelId, title })

  const ac = createAdminClient()

  const { data: integration, error } = await ac
    .from("org_integrations")
    .select("allowed_channel_ids, slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  if (error) {
    console.log("[Slack Notifications] Error fetching integration:", error.message)
    return false
  }

  if (!integration?.slack_bot_token_encrypted) {
    console.log("[Slack Notifications] No bot token configured, skipping announcement")
    return false
  }

  const channelAllowed = await isChannelAllowed(orgId, channelId)
  if (!channelAllowed) {
    console.log("[Slack Notifications] Channel not in allowlist, skipping announcement")
    return false
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📢 ${title}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: body },
    },
  ]

  if (linkUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Learn More", emoji: true },
          url: linkUrl,
          style: "primary",
        },
      ],
    })
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `Posted from <${siteUrl}|${orgId}> announcements` },
    ],
  })

  console.log("[Slack Notifications] Posting announcement to channel:", channelId)
  const result = await postToSlackChannelById(orgId, channelId, title, blocks)
  console.log("[Slack Notifications] Announcement post result:", result)
  return result
}
