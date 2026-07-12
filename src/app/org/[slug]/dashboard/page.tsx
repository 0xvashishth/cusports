import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardLayout } from "@/components/dashboard-layout"
import { DashboardOverviewClient } from "./overview-client"

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  // ---- Players ----
  const [
    { count: totalPlayers },
    { count: activePlayers },
  ] = await Promise.all([
    admin
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("org_role", "player"),
    admin
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("org_role", "player")
      .eq("status", "active"),
  ])

  // ---- Tournaments ----
  const [
    { count: totalTournaments },
    { count: draftTournaments },
    { count: publishedTournaments },
    { count: completedTournaments },
  ] = await Promise.all([
    admin
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
    admin
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "draft"),
    admin
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "published"),
    admin
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "completed"),
  ])

  // ---- Bracket matches ----
  const { data: bracketMatchRows } = await admin
    .from("bracket_matches")
    .select("id, status, created_at, tournament_category_id")
    .in("status", ["pending", "scheduled", "ongoing", "completed", "walkover"])

  const { data: bracketCompletedRows } = await admin
    .from("bracket_matches")
    .select("id, status, created_at, tournament_category_id")
    .eq("status", "completed")

  // Filter bracket matches to this org via tournament_categories map
  const { data: tcRows } = await admin
    .from("tournament_categories")
    .select("id, tournament_id")
  const { data: orgTournaments } = await admin
    .from("tournaments")
    .select("id")
    .eq("organization_id", org.id)

  const orgTournamentIds = new Set((orgTournaments || []).map((t: { id: string }) => t.id))
  const tcToTournament = new Map(
    (tcRows || []).map((tc: { id: string; tournament_id: string }) => [tc.id, tc.tournament_id])
  )
  const tcToCategoryId = new Map<string, string>()

  const { data: tcFullRows } = await admin
    .from("tournament_categories")
    .select("id, category_id")
  for (const row of tcFullRows || []) {
    tcToCategoryId.set(row.id, row.category_id)
  }

  const orgBracketMatches = (bracketMatchRows || []).filter((bm: { tournament_category_id: string }) => {
    const tid = tcToTournament.get(bm.tournament_category_id)
    return tid && orgTournamentIds.has(tid)
  })
  const orgBracketCompleted = (bracketCompletedRows || []).filter(
    (bm: { id: string }) => orgBracketMatches.some((obm: { id: string }) => obm.id === bm.id)
  )

  const totalMatches = orgBracketMatches.length
  const completedMatches = orgBracketCompleted.length
  const scheduledMatches = orgBracketMatches.filter((m: { status: string }) => m.status === "scheduled").length
  const ongoingMatches = orgBracketMatches.filter((m: { status: string }) => m.status === "ongoing").length
  const pendingApprovalMatches = 0

  // ---- Top players (by rating/points) ----
  const { data: topRankings } = await admin
    .from("rankings")
    .select(`
      id,
      rating,
      points,
      matches_played,
      wins,
      losses,
      entity_id,
      entity_type,
      category:categories(name)
    `)
    .eq("organization_id", org.id)
    .eq("entity_type", "player")

  const allEntityIds = [...new Set((topRankings || []).map((r: { entity_id: string }) => r.entity_id))]

  const [{ data: memberRows }, { data: profileRows }] = await Promise.all([
    allEntityIds.length > 0
      ? admin.from("org_members").select("profile_id").eq("organization_id", org.id).in("profile_id", allEntityIds)
      : Promise.resolve({ data: [] }),
    allEntityIds.length > 0
      ? admin.from("profiles").select("id, full_name, email").in("id", allEntityIds)
      : Promise.resolve({ data: [] }),
  ])

  const memberSet = new Set((memberRows || []).map((m: { profile_id: string }) => m.profile_id))
  const profileMap = new Map((profileRows || []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]))

  const playerBestRating = new Map<string, { rating: number | null; points: number | null; matches_played: number; wins: number; losses: number; player: { full_name: string | null; email: string | null } | null; category: { name: string } | null }>()
  for (const r of topRankings || []) {
    if (!memberSet.has(r.entity_id) || !profileMap.has(r.entity_id)) continue
    const existing = playerBestRating.get(r.entity_id)
    const metric = org.ranking_model === "elo" ? r.rating : r.points
    if (!existing || (metric != null && ((org.ranking_model === "elo" ? existing.rating : existing.points) == null || metric > (org.ranking_model === "elo" ? (existing.rating ?? 0) : (existing.points ?? 0))))) {
      playerBestRating.set(r.entity_id, {
        rating: r.rating,
        points: r.points,
        matches_played: r.matches_played,
        wins: r.wins,
        losses: r.losses,
        player: profileMap.get(r.entity_id) || null,
        category: (Array.isArray(r.category) ? r.category[0] : r.category) as { name: string } | null,
      })
    }
  }

  const topPlayers = [...playerBestRating.entries()]
    .sort(([, a], [, b]) => {
      const aVal = org.ranking_model === "elo" ? (a.rating ?? 0) : (a.points ?? 0)
      const bVal = org.ranking_model === "elo" ? (b.rating ?? 0) : (b.points ?? 0)
      return bVal - aVal
    })
    .slice(0, 5)
    .map(([entityId, data], i) => ({
      id: entityId,
      rank: i + 1,
      ...data,
    }))

  // ---- Recent matches (bracket only, last 5) ----
  const recentBracketIds = orgBracketMatches
    .sort((a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((m: { id: string }) => m.id)

  let recentBracketMatches: {
    id: string
    status: string
    created_at: string
    scheduled_at: string | null
    winner_id: string | null
    player_a_id: string | null
    player_b_id: string | null
    player_a: { full_name: string | null } | null
    player_b: { full_name: string | null } | null
    tournament: { name: string } | null
    category: { name: string } | null
  }[] = []
  if (recentBracketIds.length > 0) {
    const { data: bmWithPlayers } = await admin
      .from("bracket_matches")
      .select(`
        id,
        status,
        created_at,
        scheduled_at,
        winner_id,
        player_a_id,
        player_b_id,
        tournament_category_id
      `)
      .in("id", recentBracketIds)

    const playerIds = new Set<string>()
    for (const bm of bmWithPlayers || []) {
      if (bm.player_a_id) playerIds.add(bm.player_a_id)
      if (bm.player_b_id) playerIds.add(bm.player_b_id)
    }

    const { data: playerProfiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...playerIds])

    const profileNameMap = new Map((playerProfiles || []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

    recentBracketMatches = (bmWithPlayers || []).map((bm: Record<string, unknown>) => ({
      id: bm.id as string,
      status: bm.status as string,
      created_at: bm.created_at as string,
      scheduled_at: bm.scheduled_at as string | null,
      winner_id: bm.winner_id as string | null,
      player_a_id: bm.player_a_id as string | null,
      player_b_id: bm.player_b_id as string | null,
      player_a: bm.player_a_id ? { full_name: profileNameMap.get(bm.player_a_id as string) || null } : null,
      player_b: bm.player_b_id ? { full_name: profileNameMap.get(bm.player_b_id as string) || null } : null,
      tournament: null,
      category: null,
    }))
  }

  const allRecent = recentBracketMatches
    .sort((a: { created_at: string }, b: { created_at: string }) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // ---- Recent activity ----
  const { data: recentActivity } = await admin
    .from("activity_log")
    .select("id, action, details, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(8)

  // ---- Monthly match data (last 6 months) ----
  const bracketMonthly = orgBracketCompleted.map((m: { created_at: string }) => ({ created_at: m.created_at, status: "completed" }))
  const monthlyData = processMonthlyData(bracketMonthly)

  // ---- Category stats (matches per category from bracket matches) ----
  const { data: categoryStats } = await admin
    .from("categories")
    .select(`
      id,
      name,
      is_doubles,
      rankings!inner(id, matches_played, wins, losses)
    `)
    .eq("organization_id", org.id)

  const categoryMatchCounts = new Map<string, number>()
  for (const bm of orgBracketCompleted) {
    const catId = tcToCategoryId.get(bm.tournament_category_id)
    if (catId) {
      categoryMatchCounts.set(catId, (categoryMatchCounts.get(catId) || 0) + 1)
    }
  }

  return (
    <DashboardLayout organization={org}>
      <DashboardOverviewClient
        org={org}
        stats={{
          totalPlayers: totalPlayers || 0,
          activePlayers: activePlayers || 0,
          totalMatches,
          completedMatches,
          scheduledMatches,
          ongoingMatches,
          pendingApprovalMatches,
          totalTournaments: totalTournaments || 0,
          draftTournaments: draftTournaments || 0,
          publishedTournaments: publishedTournaments || 0,
          completedTournaments: completedTournaments || 0,
        }}
        topPlayers={(topPlayers || []) as unknown as DashboardPageProps["topPlayers"]}
        recentMatches={allRecent as DashboardPageProps["recentMatches"]}
        recentActivity={(recentActivity || []) as unknown as DashboardPageProps["recentActivity"]}
        monthlyData={monthlyData}
        categoryStats={(categoryStats || []).map((cat: { id: string; name: string; is_doubles: boolean; rankings: unknown[] }) => ({
          id: cat.id,
          name: cat.name,
          matchCount: categoryMatchCounts.get(cat.id) || 0,
        }))}
      />
    </DashboardLayout>
  )
}

function processMonthlyData(matches: { created_at: string }[]) {
  const now = new Date()
  const months: { month: string; matches: number }[] = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" })
    months.push({ month: label, matches: 0 })
  }

  for (const match of matches) {
    const d = new Date(match.created_at)
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" })
    const entry = months.find((m) => m.month === label)
    if (entry) entry.matches++
  }

  return months
}

interface DashboardPageProps {
  topPlayers: {
    id: string
    rank: number
    rating: number | null
    points: number | null
    matches_played: number
    wins: number
    losses: number
    player: { full_name: string | null; email: string | null } | null
    category: { name: string } | null
  }[]
  recentMatches: {
    id: string
    status: string
    created_at: string
    scheduled_at: string | null
    winner_id: string | null
    player_a_id: string | null
    player_b_id: string | null
    player_a: { full_name: string | null } | null
    player_b: { full_name: string | null } | null
    tournament: { name: string } | null
    category: { name: string } | null
  }[]
  recentActivity: {
    id: string
    action: string
    details: Record<string, unknown>
    created_at: string
  }[]
  monthlyData: { month: string; matches: number }[]
  categoryStats: {
    id: string
    name: string
    matchCount: number
  }[]
}
