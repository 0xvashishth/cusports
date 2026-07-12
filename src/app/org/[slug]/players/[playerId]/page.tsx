import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, cn } from "@/lib/utils"
import { Trophy, TrendingUp, TrendingDown, Activity, Calendar } from "lucide-react"

interface NormalizedMatch {
  id: string
  source: "legacy" | "bracket"
  tournamentName: string | null
  tournamentId: string | null
  categoryName: string | null
  opponentName: string
  opponentId: string | null
  won: boolean
  status: string
  round: string | null
  date: string | null
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ slug: string; playerId: string }> }) {
  const { slug, playerId } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", playerId).single()
  if (!profile) notFound()

  const { data: rankings } = await supabase
    .from("rankings")
    .select("*, category:categories(*)")
    .eq("organization_id", org.id)
    .eq("entity_id", playerId)
    .eq("entity_type", "player")

  // ── Bracket matches (bracket_matches table) ───────────────────────
  const { data: bracketMatches } = await supabase
    .from("bracket_matches")
    .select(`
      id, player_a_id, player_b_id, winner_id, loser_id, status,
      round_number, bracket_side, scheduled_at, created_at, is_bye,
      tournament_category:tournament_categories(
        id,
        tournament:tournaments(id, name),
        category:categories(id, name)
      )
    `)
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)

  // Collect opponent IDs from bracket matches to fetch their names
  const opponentIds = new Set<string>()
  for (const bm of bracketMatches || []) {
    const oppId = bm.player_a_id === playerId ? bm.player_b_id : bm.player_a_id
    if (oppId) opponentIds.add(oppId)
  }

  const opponentMap = new Map<string, string>()
  if (opponentIds.size > 0) {
    const { data: opponentProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(opponentIds))
    if (opponentProfiles) {
      for (const p of opponentProfiles) {
        opponentMap.set(p.id, p.full_name || "Unknown")
      }
    }
  }

  // ── Normalize bracket matches ─────────────────────────────────────
  const bracketNormalized: NormalizedMatch[] = (bracketMatches || [])
    .filter((bm) => !bm.is_bye && (bm.status === "completed" || bm.status === "walkover"))
    .map((bm) => {
      const isPlayerA = bm.player_a_id === playerId
      const oppId = isPlayerA ? bm.player_b_id : bm.player_a_id
      const tcRaw = bm.tournament_category as unknown
      const tc = Array.isArray(tcRaw) ? tcRaw[0] as Record<string, unknown> | undefined : tcRaw as Record<string, unknown> | null
      const tournament = tc?.tournament as Record<string, unknown> | null
      const category = tc?.category as Record<string, unknown> | null
      const sideLabel = bm.bracket_side === "winners" ? "WB" : bm.bracket_side === "losers" ? "LB" : bm.bracket_side === "grand_final" ? "GF" : bm.bracket_side === "third_place" ? "3P" : ""
      return {
        id: bm.id,
        source: "bracket",
        tournamentName: (tournament?.name as string) || null,
        tournamentId: (tournament?.id as string) || null,
        categoryName: (category?.name as string) || null,
        opponentName: oppId ? (opponentMap.get(oppId) || "Unknown") : "BYE",
        opponentId: oppId || null,
        won: bm.winner_id === playerId,
        status: bm.status,
        round: sideLabel ? `${sideLabel} R${bm.round_number}` : null,
        date: bm.scheduled_at || bm.created_at,
      }
    })

  // ── All matches (bracket only) ────────────────────────────────────
  const allMatches = bracketNormalized
    .sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

  // ── Stats ─────────────────────────────────────────────────────────
  const wins = allMatches.filter((m) => m.status === "completed" && m.won).length
  const losses = allMatches.filter((m) => m.status === "completed" && !m.won).length
  const totalMatches = wins + losses
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0

  // ── Per-category W-L from actual matches (for rankings table) ─────
  const categoryStats = new Map<string, { wins: number; losses: number; matches: number }>()
  for (const m of allMatches) {
    if (m.status !== "completed" || !m.categoryName) continue
    const key = m.categoryName
    const existing = categoryStats.get(key) || { wins: 0, losses: 0, matches: 0 }
    existing.matches++
    if (m.won) existing.wins++
    else existing.losses++
    categoryStats.set(key, existing)
  }

  const initials = (profile.full_name || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        <Avatar className="w-24 h-24 md:w-32 md:h-32 border-4 border-muted">
          <AvatarFallback className="text-3xl md:text-4xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-bold">{profile.full_name}</h1>
          <p className="text-muted-foreground mt-1">{profile.email}</p>
          <div className="flex items-center gap-2 mt-3 justify-center md:justify-start">
            <Badge variant="secondary" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              {totalMatches} matches
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Wins"
          value={wins}
          valueClassName="text-green-600 dark:text-green-400"
        />
        <StatCard
          icon={TrendingDown}
          label="Losses"
          value={losses}
          valueClassName="text-red-600 dark:text-red-400"
        />
        <StatCard
          icon={Trophy}
          label="Win Rate"
          value={`${winRate}%`}
        />
        <StatCard
          icon={Activity}
          label="Total Matches"
          value={totalMatches}
        />
      </div>

      {rankings && rankings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              Rankings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Rating / Points</TableHead>
                  <TableHead className="text-right">Matches</TableHead>
                  <TableHead className="text-right">W-L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((r) => {
                  const catName = r.category?.name || "Unknown"
                  const stats = categoryStats.get(catName)
                  const rWins = stats?.wins ?? r.wins ?? 0
                  const rLosses = stats?.losses ?? r.losses ?? 0
                  const rMatches = stats?.matches ?? r.matches_played ?? 0
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{catName}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {r.rating || r.points || 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {rMatches}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-green-600 dark:text-green-400 font-medium">{rWins}</span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-red-600 dark:text-red-400 font-medium">{rLosses}</span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Match History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allMatches.length > 0 ? (
            <div className="space-y-3">
              {allMatches.map((m) => (
                <div
                  key={`${m.source}-${m.id}`}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border",
                    m.status === "completed" && m.won && "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20",
                    m.status === "completed" && !m.won && "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {m.tournamentName && m.tournamentId && (
                        <Link
                          href={`/org/${slug}/tournaments/${m.tournamentId}`}
                          className="text-sm text-muted-foreground hover:text-foreground truncate"
                        >
                          {m.tournamentName}
                        </Link>
                      )}
                      {m.categoryName && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {m.categoryName}
                        </Badge>
                      )}
                      {m.round && (
                        <span className="text-xs text-muted-foreground/70">{m.round}</span>
                      )}
                    </div>
                    <p className="font-medium truncate">
                      vs{" "}
                      {m.opponentId ? (
                        <Link
                          href={`/org/${slug}/players/${m.opponentId}`}
                          className="hover:underline"
                        >
                          {m.opponentName}
                        </Link>
                      ) : (
                        <span>{m.opponentName}</span>
                      )}
                      {m.status === "completed" && m.won && <span className="ml-1">{"\uD83D\uDC51"}</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    {m.status === "completed" ? (
                      <Badge variant={m.won ? "success" : "destructive"}>
                        {m.won ? "Won" : "Lost"}
                      </Badge>
                    ) : (
                      <Badge variant={m.status === "ongoing" ? "warning" : "secondary"}>
                        {m.status}
                      </Badge>
                    )}
                    {m.date && (
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(m.date)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Activity className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No matches played yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Match history will appear once this player competes in a tournament.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className={cn("text-3xl font-bold tabular-nums", valueClassName)}>{value}</p>
      </CardContent>
    </Card>
  )
}
