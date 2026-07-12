import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Look up a player by their Slack user ID.
 * Fetches the user's email from the Slack API, then matches it against profiles.email.
 */
export async function findPlayerBySlackUserId(
  orgId: string,
  slackUserId: string,
  botToken: string,
): Promise<{ id: string; email: string; fullName: string } | null> {
  console.log("[Slack Players] findPlayerBySlackUserId:", { orgId, slackUserId })

  const res = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    {
      headers: { Authorization: `Bearer ${botToken}` },
    },
  )
  const data = await res.json()
  console.log("[Slack Players] Slack API users.info response:", JSON.stringify(data, null, 2))

  if (!data.ok || !data.user?.profile?.email) {
    console.log("[Slack Players] Failed to get user info or no email:", { ok: data.ok, hasEmail: !!data.user?.profile?.email })
    return null
  }

  const email = data.user.profile.email.toLowerCase()
  console.log("[Slack Players] Slack user email:", email)

  const ac = createAdminClient()
  const { data: profile, error: profileErr } = await ac
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .single()

  console.log("[Slack Players] Profile lookup:", { profile, error: profileErr?.message })

  if (!profile) {
    console.log("[Slack Players] No profile found for email:", email)
    return null
  }

  const { data: memberCheck, error: memberErr } = await ac
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .single()

  console.log("[Slack Players] Org member check:", { member: memberCheck, error: memberErr?.message })

  if (!memberCheck) {
    console.log("[Slack Players] Player is not an active member of org:", orgId)
    return null
  }

  const result = {
    id: profile.id,
    email,
    fullName: profile.full_name || email,
  }
  console.log("[Slack Players] Player found:", result)
  return result
}

/**
 * Look up a player by name (exact match on full_name, case-insensitive).
 * Must be an active member of the org.
 */
export async function findPlayerByName(
  orgId: string,
  name: string,
): Promise<{ id: string; email: string | null; fullName: string } | null> {
  console.log("[Slack Players] findPlayerByName:", { orgId, name })
  const ac = createAdminClient()

  const cleanName = name.replace(/^@/, "").trim()
  console.log("[Slack Players] Cleaned name:", cleanName)

  const { data: profiles, error } = await ac
    .from("profiles")
    .select("id, email, full_name")
    .ilike("full_name", cleanName)

  console.log("[Slack Players] Name search result:", { count: profiles?.length, error: error?.message })

  if (!profiles || profiles.length === 0) {
    console.log("[Slack Players] No profiles found with name:", cleanName)
    return null
  }
  if (profiles.length > 1) {
    console.log("[Slack Players] Multiple profiles found with name:", cleanName, "- refusing to disambiguate")
    return null
  }

  const profile = profiles[0]
  console.log("[Slack Players] Profile found:", { id: profile.id, email: profile.email, name: profile.full_name })

  const { data: member, error: memberErr } = await ac
    .from("org_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .single()

  console.log("[Slack Players] Org member check:", { member, error: memberErr?.message })

  if (!member) {
    console.log("[Slack Players] Player not an active member of org:", orgId)
    return null
  }

  const result = {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email || "Unknown",
  }
  console.log("[Slack Players] Player found:", result)
  return result
}

/**
 * Validate that both players are active members of the org.
 */
export async function validateBothPlayers(
  orgId: string,
  playerAId: string,
  playerBId: string,
): Promise<{ valid: boolean; error?: string }> {
  console.log("[Slack Players] validateBothPlayers:", { orgId, playerAId, playerBId })
  const ac = createAdminClient()

  const { data: members, error } = await ac
    .from("org_members")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("profile_id", [playerAId, playerBId])

  console.log("[Slack Players] Both players check:", { count: members?.length, error: error?.message })

  if (!members || members.length < 2) {
    console.log("[Slack Players] Not both players are active members")
    return { valid: false, error: "Both players must be active members of this organization" }
  }

  return { valid: true }
}
