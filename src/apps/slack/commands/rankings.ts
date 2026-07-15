import { createAdminClient } from "@/lib/supabase/admin"
import type { SlackCommandResult } from "../types"

export async function handleRankings(orgId: string): Promise<SlackCommandResult> {
  console.log("[Slack Rankings] handleRankings called for orgId:", orgId)
  const ac = createAdminClient()

  const { data: rankings, error } = await ac
    .from("rankings")
    .select("category_id, category:categories(name), entity_id, entity_type, rating, points, matches_played, wins, losses, profile:profiles!rankings_entity_id_fkey(id, full_name)")
    .eq("organization_id", orgId)
    .eq("entity_type", "player")
    .order("rating", { ascending: false })

  if (error) {
    console.error("[Slack Rankings] Error fetching rankings:", error)
    return { success: false, replyMessage: "Error fetching rankings." }
  }

  if (!rankings || rankings.length === 0) {
    return { success: true, replyMessage: "No rankings available yet. Rankings are generated after matches are played." }
  }

  const byCategory = new Map<string, typeof rankings>()
  for (const r of rankings) {
    const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile
    if (!profile) continue
    const cat = r.category as { name: string }[] | { name: string } | null
    const catName = (Array.isArray(cat) ? cat[0] : cat)?.name || "Unknown"
    if (!byCategory.has(catName)) byCategory.set(catName, [])
    byCategory.get(catName)!.push(r)
  }

  if (byCategory.size === 0) {
    return { success: true, replyMessage: "No active players found in rankings." }
  }

  const lines: string[] = []

  for (const [catName, catRankings] of byCategory) {
    lines.push(`*${catName}*`)

    const sorted = catRankings
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 10)

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile
      const name = profile?.full_name || "Unknown"
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
