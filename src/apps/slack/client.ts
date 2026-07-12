import { createAdminClient } from "@/lib/supabase/admin"

export async function getSlackBotToken(orgId: string): Promise<string | null> {
  console.log("[Slack Client] getSlackBotToken for orgId:", orgId)
  const ac = createAdminClient()
  const { data, error } = await ac
    .from("org_integrations")
    .select("slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  if (error) {
    console.log("[Slack Client] Error fetching integration:", error.message)
    return null
  }

  if (!data?.slack_bot_token_encrypted) {
    console.log("[Slack Client] No bot token found for org:", orgId)
    return null
  }
  const token = atob(data.slack_bot_token_encrypted)
  console.log("[Slack Client] Bot token retrieved, length:", token.length)
  return token
}

export async function postToSlackChannel(
  orgId: string,
  message: string,
  blocks?: object[],
): Promise<boolean> {
  console.log("[Slack Client] postToSlackChannel called for org:", orgId)
  const token = await getSlackBotToken(orgId)
  if (!token) {
    console.log("[Slack Client] No bot token, cannot post")
    return false
  }

  const ac = createAdminClient()
  const { data: integration, error: intErr } = await ac
    .from("org_integrations")
    .select("slack_channel_id")
    .eq("organization_id", orgId)
    .single()

  if (intErr) {
    console.log("[Slack Client] Error fetching integration for channel:", intErr.message)
    return false
  }

  if (!integration?.slack_channel_id) {
    console.log("[Slack Client] No slack_channel_id configured for org:", orgId)
    return false
  }

  console.log("[Slack Client] Posting to channel:", integration.slack_channel_id)

  const payload: Record<string, unknown> = {
    channel: integration.slack_channel_id,
    text: message,
  }
  if (blocks) payload.blocks = blocks

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  console.log("[Slack Client] chat.postMessage response:", JSON.stringify(data, null, 2))
  return data.ok === true
}

export async function postToSlackChannelById(
  orgId: string,
  channelId: string,
  message: string,
  blocks?: object[],
): Promise<boolean> {
  console.log("[Slack Client] postToSlackChannelById called:", { orgId, channelId })
  const token = await getSlackBotToken(orgId)
  if (!token) {
    console.log("[Slack Client] No bot token, cannot post to channel:", channelId)
    return false
  }

  const payload: Record<string, unknown> = {
    channel: channelId,
    text: message,
  }
  if (blocks) payload.blocks = blocks

  console.log("[Slack Client] Posting message to channel:", channelId)
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  console.log("[Slack Client] chat.postMessage response:", JSON.stringify(data, null, 2))
  return data.ok === true
}

export async function isChannelAllowed(
  orgId: string,
  channelId: string,
): Promise<boolean> {
  console.log("[Slack Client] isChannelAllowed check:", { orgId, channelId })
  const ac = createAdminClient()
  const { data: integration, error } = await ac
    .from("org_integrations")
    .select("allowed_channel_ids")
    .eq("organization_id", orgId)
    .single()

  if (error) {
    console.log("[Slack Client] Error fetching allowed channels:", error.message)
    return false
  }

  if (!integration?.allowed_channel_ids || integration.allowed_channel_ids.length === 0) {
    console.log("[Slack Client] No channel allowlist configured, all channels allowed")
    return true
  }
  const allowed = integration.allowed_channel_ids.includes(channelId)
  console.log("[Slack Client] Channel allowed:", allowed, "allowlist:", integration.allowed_channel_ids)
  return allowed
}

export async function addReaction(
  orgId: string,
  channelId: string,
  timestamp: string,
  emoji: string,
): Promise<boolean> {
  console.log("[Slack Client] addReaction called:", { orgId, channelId, timestamp, emoji })
  const token = await getSlackBotToken(orgId)
  if (!token) {
    console.log("[Slack Client] No bot token, cannot add reaction")
    return false
  }

  const res = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: channelId,
      timestamp: timestamp,
      name: emoji,
    }),
  })

  const data = await res.json()
  console.log("[Slack Client] reactions.add response:", JSON.stringify(data, null, 2))
  return data.ok === true
}

export async function lookupOrgBySlackTeam(
  teamId: string,
): Promise<{ orgId: string; orgSlug: string; orgName: string; integrationId: string } | null> {
  console.log("[Slack Client] lookupOrgBySlackTeam for teamId:", teamId)
  const ac = createAdminClient()
  const { data, error } = await ac
    .from("org_integrations")
    .select("id, organization_id, organization:organizations(id, slug, name)")
    .eq("slack_team_id", teamId)
    .single()

  if (error) {
    console.log("[Slack Client] Error looking up org for team:", error.message)
    return null
  }

  if (!data) {
    console.log("[Slack Client] No integration found for team_id:", teamId)
    return null
  }

  const org = data.organization as unknown as { id: string; slug: string; name: string } | null
  if (!org) {
    console.log("[Slack Client] Integration found but no linked org for team_id:", teamId)
    return null
  }

  const result = {
    orgId: data.organization_id,
    orgSlug: org.slug,
    orgName: org.name,
    integrationId: data.id,
  }
  console.log("[Slack Client] Org lookup result:", result)
  return result
}
