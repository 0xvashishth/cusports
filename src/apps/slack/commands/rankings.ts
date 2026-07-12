import { createAdminClient } from "@/lib/supabase/admin"
import type { SlackCommandResult } from "../types"

export async function handleRankings(orgId: string): Promise<SlackCommandResult> {
  console.log("[Slack Rankings] handleRankings called for orgId:", orgId)
  const ac = createAdminClient()

  const { data: categories } = await ac
    .from("categories")
    .select("id, name")
    .eq("organization_id", orgId)
    .order("name", { ascending: true })

  if (!categories || categories.length === 0) {
    return { success: true, replyMessage: "No categories found for this organization." }
  }

  const categoryIds = categories.map((c) => c.id)

  const { data: rankings } = await ac
    .from("rankings")
    .select("category_id, entity_id, entity_type, rating, points, matches_played, wins, losses")
    .eq("organization_id", orgId)
    .in("category_id", categoryIds)
    .eq("entity_type", "player")
    .order("rating", { ascending: false })

  if (!rankings || rankings.length === 0) {
    return { success: true, replyMessage: "No rankings available yet. Rankings are generated after matches are played." }
  }

  const playerIds = [...new Set(rankings.map((r) => r.entity_id))]
  const { data: profiles } = await ac
    .from("profiles")
    .select("id, full_name")
    .in("id", playerIds)

  const profileMap = new Map<string, string>()
  for (const p of profiles || []) {
    profileMap.set(p.id, p.full_name || "Unknown")
  }

  const categoryMap = new Map<string, string>()
  for (const c of categories) {
    categoryMap.set(c.id, c.name)
  }

  const byCategory = new Map<string, typeof rankings>()
  for (const r of rankings) {
    const catName = categoryMap.get(r.category_id) || "Unknown"
    if (!byCategory.has(catName)) byCategory.set(catName, [])
    byCategory.get(catName)!.push(r)
  }

  const lines: string[] = []

  for (const [catName, catRankings] of byCategory) {
    lines.push(`*${catName}*`)

    const sorted = catRankings
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 10)

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      const name = profileMap.get(r.entity_id) || "Unknown"
      const medal = i === 0 ? " 🥇" : i === 1 ? " 🥈" : i === 2 ? " 🥉" : ""
      const rating = r.rating != null ? Math.round(Number(r.rating)) : "-"
      const wl = `${r.wins || 0}W-${r.losses || 0}L`
      lines.push(`  ${i + 1}. ${name}${medal} — ${rating} (${wl})`)
    }

    lines.push("")
  }

  const message = lines.join("\n").trim()
  console.log("[Slack Rankings] Sending rankings:", message)
  return { success: true, replyMessage: message }
}
