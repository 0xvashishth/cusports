import { createAdminClient } from "@/lib/supabase/admin"

export async function getSlackBotToken(orgId: string): Promise<string | null> {
  const ac = createAdminClient()
  const { data } = await ac
    .from("org_integrations")
    .select("slack_bot_token_encrypted")
    .eq("organization_id", orgId)
    .single()

  if (!data?.slack_bot_token_encrypted) return null
  return atob(data.slack_bot_token_encrypted)
}

export async function postToSlackChannel(
  orgId: string,
  message: string,
  blocks?: object[],
): Promise<boolean> {
  const token = await getSlackBotToken(orgId)
  if (!token) return false

  const ac = createAdminClient()
  const { data: integration } = await ac
    .from("org_integrations")
    .select("slack_channel_id")
    .eq("organization_id", orgId)
    .single()

  if (!integration?.slack_channel_id) return false

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
  return data.ok === true
}

export async function postToSlackChannelById(
  orgId: string,
  channelId: string,
  message: string,
  blocks?: object[],
): Promise<boolean> {
  const token = await getSlackBotToken(orgId)
  if (!token) return false

  const payload: Record<string, unknown> = {
    channel: channelId,
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
  return data.ok === true
}

export async function isChannelAllowed(
  orgId: string,
  channelId: string,
): Promise<boolean> {
  const ac = createAdminClient()
  const { data: integration } = await ac
    .from("org_integrations")
    .select("allowed_channel_ids")
    .eq("organization_id", orgId)
    .single()

  if (!integration?.allowed_channel_ids || integration.allowed_channel_ids.length === 0) {
    return true
  }
  return integration.allowed_channel_ids.includes(channelId)
}

export async function lookupOrgBySlackTeam(
  teamId: string,
): Promise<{ orgId: string; orgSlug: string; orgName: string; integrationId: string } | null> {
  const ac = createAdminClient()
  const { data } = await ac
    .from("org_integrations")
    .select("id, organization_id, organization:organizations(id, slug, name)")
    .eq("slack_team_id", teamId)
    .single()

  if (!data) return null

  const org = data.organization as unknown as { id: string; slug: string; name: string } | null
  if (!org) return null

  return {
    orgId: data.organization_id,
    orgSlug: org.slug,
    orgName: org.name,
    integrationId: data.id,
  }
}
