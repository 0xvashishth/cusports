import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardLayout } from "@/components/dashboard-layout"
import { PlayersClient } from "./players-client"

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

  // Compute match stats directly from matches and bracket_matches
  const { data: allMatches } = await adminClient
    .from("matches")
    .select("player_a_id, player_b_id, winner_id")
    .eq("organization_id", org.id)
    .eq("status", "completed")
    .not("winner_id", "is", null)

  const { data: tcData } = await adminClient.from("tournament_categories").select("id, category_id")
  const tcMap = new Map((tcData || []).map((tc: { id: string; category_id: string }) => [tc.id, tc.category_id]))

  const { data: allBracketMatches } = await adminClient
    .from("bracket_matches")
    .select("player_a_id, player_b_id, winner_id")
    .in("status", ["completed", "walkover"])
    .not("winner_id", "is", null)

  const matchStats = new Map<string, { played: number; wins: number; losses: number }>()
  function addStat(id: string, field: "played" | "wins" | "losses") {
    const s = matchStats.get(id) || { played: 0, wins: 0, losses: 0 }
    s[field]++
    matchStats.set(id, s)
  }

  for (const m of allMatches || []) {
    const r = m as { player_a_id: string; player_b_id: string; winner_id: string }
    addStat(r.player_a_id, "played")
    addStat(r.player_b_id, "played")
    addStat(r.winner_id, "wins")
    addStat(r.winner_id === r.player_a_id ? r.player_b_id : r.player_a_id, "losses")
  }

  for (const m of allBracketMatches || []) {
    const r = m as { player_a_id: string | null; player_b_id: string | null; winner_id: string }
    if (r.player_a_id) addStat(r.player_a_id, "played")
    if (r.player_b_id) addStat(r.player_b_id, "played")
    addStat(r.winner_id, "wins")
    const loserId = r.winner_id === r.player_a_id ? r.player_b_id : r.player_a_id
    if (loserId) addStat(loserId, "losses")
  }

  const rankingsWithCategory = (rankings || []).map((r) => ({
    ...r,
    category_name: categoryNames.get(r.category_id) || "Unknown",
    // Override with computed stats
    matches_played: matchStats.get(r.entity_id)?.played ?? r.matches_played,
    wins: matchStats.get(r.entity_id)?.wins ?? r.wins,
    losses: matchStats.get(r.entity_id)?.losses ?? r.losses,
  }))

  return (
    <DashboardLayout organization={org}>
      <PlayersClient
        org={org}
        members={members || []}
        rankings={rankingsWithCategory}
        categories={categories || []}
      />
    </DashboardLayout>
  )
}
