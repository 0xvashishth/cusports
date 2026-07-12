import { createAdminClient } from "@/lib/supabase/admin"
import type { ResolvedPlayers } from "../types"

/**
 * Look up a player by their Slack user ID.
 * Fetches the user's email from the Slack API, then matches it against profiles.email.
 */
export async function findPlayerBySlackUserId(
  orgId: string,
  slackUserId: string,
  botToken: string,
): Promise<{ id: string; email: string; fullName: string } | null> {
  const res = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    {
      headers: { Authorization: `Bearer ${botToken}` },
    },
  )
  const data = await res.json()
  if (!data.ok || !data.user?.profile?.email) return null

  const email = data.user.profile.email.toLowerCase()

  const ac = createAdminClient()
  const { data: profile } = await ac
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .single()

  if (!profile) return null

  const memberCheck = await ac
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .single()

  if (!memberCheck.data) return null

  return {
    id: profile.id,
    email,
    fullName: profile.full_name || email,
  }
}

/**
 * Look up a player by name (exact match on full_name, case-insensitive).
 * Must be an active member of the org.
 */
export async function findPlayerByName(
  orgId: string,
  name: string,
): Promise<{ id: string; email: string | null; fullName: string } | null> {
  const ac = createAdminClient()

  const cleanName = name.replace(/^@/, "").trim()

  const { data: profiles } = await ac
    .from("profiles")
    .select("id, email, full_name")
    .ilike("full_name", cleanName)

  if (!profiles || profiles.length === 0) return null
  if (profiles.length > 1) return null

  const profile = profiles[0]

  const { data: member } = await ac
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .single()

  if (!member) return null

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email || "Unknown",
  }
}

/**
 * Validate that both players are active members of the org.
 */
export async function validateBothPlayers(
  orgId: string,
  playerAId: string,
  playerBId: string,
): Promise<{ valid: boolean; error?: string }> {
  const ac = createAdminClient()

  const { data: members } = await ac
    .from("org_members")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("profile_id", [playerAId, playerBId])

  if (!members || members.length < 2) {
    return { valid: false, error: "Both players must be active members of this organization" }
  }

  return { valid: true }
}
