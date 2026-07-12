import { createAdminClient } from "@/lib/supabase/admin"
import type { SlackCommandResult } from "../types"

export async function handleFixtures(orgId: string): Promise<SlackCommandResult> {
  console.log("[Slack Fixtures] handleFixtures called for orgId:", orgId)
  const ac = createAdminClient()

  const { data: tournaments } = await ac
    .from("tournaments")
    .select("id, name, start_date")
    .eq("organization_id", orgId)
    .in("status", ["published"])
    .order("start_date", { ascending: true })

  if (!tournaments || tournaments.length === 0) {
    return { success: true, message: "No active tournaments found." }
  }

  const tournamentIds = tournaments.map((t) => t.id)

  const { data: tournamentCategories } = await ac
    .from("tournament_categories")
    .select("id, tournament_id, category:categories(name)")
    .in("tournament_id", tournamentIds)

  if (!tournamentCategories || tournamentCategories.length === 0) {
    return { success: true, message: "No tournament categories found." }
  }

  const tcIds = tournamentCategories.map((tc) => tc.id)

  const { data: pendingMatches } = await ac
    .from("bracket_matches")
    .select(`
      id, tournament_category_id, round_number, bracket_side, scheduled_at,
      player_a_id, player_b_id
    `)
    .in("tournament_category_id", tcIds)
    .in("status", ["pending", "scheduled"])
    .not("player_a_id", "is", null)
    .not("player_b_id", "is", null)
    .eq("is_bye", false)
    .order("round_number", { ascending: true })

  if (!pendingMatches || pendingMatches.length === 0) {
    return { success: true, message: "No upcoming fixtures with confirmed players found." }
  }

  const playerIds = new Set<string>()
  for (const m of pendingMatches) {
    if (m.player_a_id) playerIds.add(m.player_a_id)
    if (m.player_b_id) playerIds.add(m.player_b_id)
  }

  const { data: profiles } = await ac
    .from("profiles")
    .select("id, full_name")
    .in("id", Array.from(playerIds))

  const profileMap = new Map<string, string>()
  for (const p of profiles || []) {
    profileMap.set(p.id, p.full_name || "Unknown")
  }

  const tcMap = new Map<string, { tournamentName: string; categoryName: string }>()
  for (const tc of tournamentCategories) {
    const tcData = tc as Record<string, unknown>
    const catName = ((tcData.category as Record<string, unknown>)?.name as string) || "Unknown"
    const tourn = tournaments.find((t) => t.id === tcData.tournament_id)
    tcMap.set(tcData.id as string, {
      tournamentName: tourn?.name || "Unknown",
      categoryName: catName,
    })
  }

  const byTournament = new Map<string, { categoryName: string; matches: typeof pendingMatches }[]>()
  for (const m of pendingMatches) {
    const tcInfo = tcMap.get(m.tournament_category_id)
    if (!tcInfo) continue
    const key = tcInfo.tournamentName
    if (!byTournament.has(key)) byTournament.set(key, [])
    const cats = byTournament.get(key)!
    const existing = cats.find((b) => b.categoryName === tcInfo.categoryName)
    if (existing) {
      existing.matches.push(m)
    } else {
      cats.push({ categoryName: tcInfo.categoryName, matches: [m] })
    }
  }

  const lines: string[] = []

  for (const [tournName, cats] of byTournament.entries()) {
    lines.push(`*${tournName}*`)
    for (const cat of cats) {
      lines.push(`  _${cat.categoryName}_`)
      for (const m of cat.matches) {
        const playerA = profileMap.get(m.player_a_id) || "Unknown"
        const playerB = profileMap.get(m.player_b_id) || "Unknown"
        const roundLabel = `R${m.round_number}`
        const sideLabel = m.bracket_side === "losers" ? " (Losers)" : m.bracket_side === "grand_final" ? " (Grand Final)" : ""
        lines.push(`    ${roundLabel}${sideLabel}: ${playerA} vs ${playerB}`)
      }
    }
    lines.push("")
  }

  const message = lines.join("\n").trim()
  console.log("[Slack Fixtures] Sending fixtures:", message)
  return { success: true, message }
}
