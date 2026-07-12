import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardLayout } from "@/components/dashboard-layout"
import { PlayersClient } from "./players-client"
import type { Category } from "@/lib/types"

export default async function PlayersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: members } = await adminClient
    .from("org_members")
    .select("*, profile:profiles(*)")
    .eq("organization_id", org.id)

  const { data: rankings } = await adminClient
    .from("rankings")
    .select("id, organization_id, category_id, entity_id, entity_type, rating, points, matches_played, wins, losses, updated_at")
    .eq("organization_id", org.id)
    .eq("entity_type", "player")

  const { data: categories } = await adminClient
    .from("categories")
    .select("id, name")
    .eq("organization_id", org.id)

  const categoryNames = new Map<string, string>()
  for (const cat of categories || []) {
    categoryNames.set(cat.id, cat.name)
  }

  // ── Get tournament_ids for this org ──────────────────────────────
  const { data: orgTournaments } = await adminClient
    .from("tournaments")
    .select("id")
    .eq("organization_id", org.id)
  const orgTournamentIds = new Set((orgTournaments || []).map((t: { id: string }) => t.id))

  // ── Get tournament_category → category mapping for this org ──────
  const { data: tcRows } = await adminClient
    .from("tournament_categories")
    .select("id, tournament_id, category_id")
  const orgTcRows = (tcRows || []).filter((tc: { tournament_id: string }) =>
    orgTournamentIds.has(tc.tournament_id)
  )
  const tcToCategoryId = new Map(orgTcRows.map((tc: { id: string; category_id: string }) => [tc.id, tc.category_id]))
  const orgTcIds = orgTcRows.map((tc: { id: string }) => tc.id)

  // ── Compute per-category W-L from bracket_matches ────────────────
  const perCategoryStats = new Map<string, Map<string, { played: number; wins: number; losses: number }>>()

  if (orgTcIds.length > 0) {
    const { data: allBracketMatches } = await adminClient
      .from("bracket_matches")
      .select("player_a_id, player_b_id, winner_id, tournament_category_id, is_bye, status")
      .in("tournament_category_id", orgTcIds)
      .in("status", ["completed", "walkover"])
      .not("winner_id", "is", null)

    for (const m of allBracketMatches || []) {
      const r = m as {
        player_a_id: string | null; player_b_id: string | null;
        winner_id: string; tournament_category_id: string; is_bye: boolean; status: string
      }
      if (r.is_bye) continue

      const catId = tcToCategoryId.get(r.tournament_category_id)
      if (!catId) continue

      if (!perCategoryStats.has(catId)) {
        perCategoryStats.set(catId, new Map())
      }
      const catMap = perCategoryStats.get(catId)!

      function addStat(id: string, field: "played" | "wins" | "losses") {
        const s = catMap.get(id) || { played: 0, wins: 0, losses: 0 }
        s[field]++
        catMap.set(id, s)
      }

      if (r.player_a_id) addStat(r.player_a_id, "played")
      if (r.player_b_id) addStat(r.player_b_id, "played")
      addStat(r.winner_id, "wins")
      const loserId = r.winner_id === r.player_a_id ? r.player_b_id : r.player_a_id
      if (loserId) addStat(loserId, "losses")
    }
  }

  // ── Also compute overall totals for summary display ───────────────
  const overallStats = new Map<string, { played: number; wins: number; losses: number }>()
  for (const [, catMap] of perCategoryStats) {
    for (const [entityId, stat] of catMap) {
      const existing = overallStats.get(entityId) || { played: 0, wins: 0, losses: 0 }
      existing.played += stat.played
      existing.wins += stat.wins
      existing.losses += stat.losses
      overallStats.set(entityId, existing)
    }
  }

  const rankingsWithStats = (rankings || []).map((r) => {
    const catStats = perCategoryStats.get(r.category_id)?.get(r.entity_id)
    return {
      ...r,
      category_name: categoryNames.get(r.category_id) || "Unknown",
      // Per-category stats
      matches_played: catStats?.played ?? r.matches_played,
      wins: catStats?.wins ?? r.wins,
      losses: catStats?.losses ?? r.losses,
    }
  })

  return (
    <DashboardLayout organization={org}>
      <PlayersClient
        org={org}
        members={members || []}
        rankings={rankingsWithStats}
        categories={(categories || []) as Category[]}
      />
    </DashboardLayout>
  )
}
