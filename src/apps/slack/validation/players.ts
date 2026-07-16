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
 * Look up a player by email.
 * Must be an active member of the org.
 */
export async function findPlayerByEmail(
  orgId: string,
  email: string,
): Promise<{ id: string; email: string; fullName: string } | null> {
  console.log("[Slack Players] findPlayerByEmail:", { orgId, email })
  const ac = createAdminClient()

  const cleanEmail = email.toLowerCase().trim()
  console.log("[Slack Players] Cleaned email:", cleanEmail)

  const { data: profile, error: profileErr } = await ac
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", cleanEmail)
    .single()

  console.log("[Slack Players] Email lookup result:", { profile, error: profileErr?.message })

  if (!profile) {
    console.log("[Slack Players] No profile found for email:", cleanEmail)
    return null
  }

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
