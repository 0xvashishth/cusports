import { notFound } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, cn } from "@/lib/utils"
import { Trophy, TrendingUp, TrendingDown, Activity, Calendar } from "lucide-react"

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

  const { data: matches } = await supabase
    .from("matches")
    .select("*, tournament:tournaments(*), category:categories(*), player_a:profiles!player_a_id(*), player_b:profiles!player_b_id(*)")
    .eq("organization_id", org.id)
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .order("created_at", { ascending: false })

  // Also fetch bracket matches involving this player
  const { data: bracketMatches } = await supabase
    .from("bracket_matches")
    .select("id, player_a_id, player_b_id, winner_id, status")
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)

  const legacyWins = matches?.filter((m) => m.winner_id === playerId).length || 0
  const legacyLosses = matches?.filter((m) => m.status === "completed" && m.winner_id !== playerId).length || 0
  const bracketWins = bracketMatches?.filter((m) => m.status === "completed" && m.winner_id === playerId).length || 0
  const bracketLosses = bracketMatches?.filter((m) => m.status === "completed" && m.winner_id !== playerId).length || 0
  const wins = legacyWins + bracketWins
  const losses = legacyLosses + bracketLosses
  const totalMatches = wins + losses
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0

  const initials = (profile.full_name || "?")
    .split(" ")
    .map((n) => n[0])
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
                {rankings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.category?.name || "Unknown"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {r.rating || r.points || 0}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {r.matches_played}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-green-600 dark:text-green-400 font-medium">{r.wins}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">{r.losses}</span>
                    </TableCell>
                  </TableRow>
                ))}
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
          {matches && matches.length > 0 ? (
            <div className="space-y-3">
              {matches.map((m) => {
                const isPlayerA = m.player_a_id === playerId
                const opponent = isPlayerA ? m.player_b : m.player_a
                const won = m.winner_id === playerId
                const isCompleted = m.status === "completed"
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border",
                      isCompleted && won && "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20",
                      isCompleted && !won && "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {m.tournament && (
                          <Link
                            href={`/org/${slug}/tournaments/${m.tournament_id}`}
                            className="text-sm text-muted-foreground hover:text-foreground truncate"
                          >
                            {m.tournament.name}
                          </Link>
                        )}
                        {m.category && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {m.category.name}
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium truncate">
                        {isPlayerA ? "vs" : "vs"}{" "}
                        <Link
                          href={`/org/${slug}/players/${opponent?.id || "#"}`}
                          className="hover:underline"
                        >
                          {opponent?.full_name || "Unknown"}
                        </Link>
                        {isCompleted && won && <span className="ml-1">{"\uD83D\uDC51"}</span>}
                      </p>
                      {m.round && <p className="text-xs text-muted-foreground">{m.round}</p>}
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      {isCompleted ? (
                        <Badge variant={won ? "success" : "destructive"}>
                          {won ? "Won" : "Lost"}
                        </Badge>
                      ) : (
                        <Badge variant={m.status === "ongoing" ? "warning" : "secondary"}>
                          {m.status}
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
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
