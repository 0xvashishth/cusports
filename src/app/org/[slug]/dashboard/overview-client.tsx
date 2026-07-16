"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Trophy, Activity, TrendingUp, Clock, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { Organization } from "@/lib/types"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

interface DashboardOverviewClientProps {
  org: Organization
  stats: {
    totalPlayers: number
    activePlayers: number
    totalMatches: number
    completedMatches: number
    scheduledMatches: number
    ongoingMatches: number
    pendingApprovalMatches: number
    totalTournaments: number
    draftTournaments: number
    publishedTournaments: number
    inProgressTournaments: number
    completedTournaments: number
  }
  topPlayers: {
    id: string
    rank: number
    rating: number | null
    points: number | null
    matches_played: number
    wins: number
    losses: number
    category: { name: string } | null
    player: { full_name: string | null; email: string | null } | null
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

const PIE_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#94a3b8"]

function formatAction(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatTimeAgo(dateStr: string) {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
    case "ongoing":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
    case "scheduled":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
    case "pending":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
  }
}

export function DashboardOverviewClient({
  org,
  stats,
  topPlayers,
  recentMatches,
  recentActivity,
  monthlyData,
  categoryStats,
}: DashboardOverviewClientProps) {
  const tournamentPieData = [
    { name: "In Progress", value: stats.inProgressTournaments },
    { name: "Published", value: stats.publishedTournaments },
    { name: "Completed", value: stats.completedTournaments },
    { name: "Draft", value: stats.draftTournaments },
  ].filter((d) => d.value > 0)

  const categoryChartData = categoryStats.map((cat) => ({
    name: cat.name,
    matches: cat.matchCount,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">
          {org.name} overview &mdash; {org.ranking_model === "elo" ? "ELO" : "Points"} ranking model
        </p>
      </div>

      {/* Primary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Players</CardTitle>
            <div className="p-2 rounded-lg text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/50">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalPlayers}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.activePlayers} active &middot; {stats.totalPlayers - stats.activePlayers} invited
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Matches</CardTitle>
            <div className="p-2 rounded-lg text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/50">
              <Activity className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalMatches}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedMatches} completed &middot; {stats.scheduledMatches} upcoming
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tournaments</CardTitle>
            <div className="p-2 rounded-lg text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950/50">
              <Trophy className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalTournaments}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.inProgressTournaments} in progress &middot; {stats.publishedTournaments} published &middot; {stats.completedTournaments} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approval</CardTitle>
            <div className="p-2 rounded-lg text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/50">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.pendingApprovalMatches}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.ongoingMatches} matches in progress
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Monthly matches chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Match Activity (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.some((m) => m.matches > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="matches" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                No match data yet. Complete some matches to see activity trends.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tournament status pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              Tournament Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tournamentPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={tournamentPieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {tournamentPieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                No tournaments yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown chart */}
      {categoryChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Matches by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="matches" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bottom row: Top players + Recent matches + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Players */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              Top Players
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPlayers.length > 0 ? (
              <div className="space-y-3">
                {topPlayers.map((player) => {
                  const name = player.player?.full_name || player.player?.email || "Unknown"
                  const metric = org.ranking_model === "elo" ? player.rating : player.points
                  const wr =
                    player.matches_played > 0
                      ? Math.round((player.wins / player.matches_played) * 100)
                      : 0
                  const medal = player.rank === 1 ? "\uD83E\uDD47" : player.rank === 2 ? "\uD83E\uDD48" : player.rank === 3 ? "\uD83E\uDD49" : null
                  return (
                    <div key={player.id} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                        {medal || player.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/org/${org.slug}/players/${player.id}`}
                          className="text-sm font-medium truncate hover:underline block"
                        >
                          {name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {player.category?.name || "All"} &middot; {player.matches_played} matches &middot; {wr}% win
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">
                          {metric != null ? Math.round(metric) : "\u2014"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {org.ranking_model === "elo" ? "ELO" : "PTS"}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No player rankings yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Matches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Recent Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length > 0 ? (
              <div className="space-y-3">
                {recentMatches.map((match) => {
                  const aWon = match.status === "completed" && match.winner_id && match.player_a_id && match.winner_id === match.player_a_id
                  const bWon = match.status === "completed" && match.winner_id && match.player_b_id && match.winner_id === match.player_b_id
                  return (
                    <div key={match.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {match.player_a_id ? (
                            <Link href={`/org/${org.slug}/players/${match.player_a_id}`} className="hover:underline">
                              {match.player_a?.full_name || "TBD"}
                            </Link>
                          ) : (
                            match.player_a?.full_name || "TBD"
                          )}
                          {aWon && <span className="ml-1">{"\uD83D\uDC51"}</span>}
                          {" vs "}
                          {match.player_b_id ? (
                            <Link href={`/org/${org.slug}/players/${match.player_b_id}`} className="hover:underline">
                              {match.player_b?.full_name || "TBD"}
                            </Link>
                          ) : (
                            match.player_b?.full_name || "TBD"
                          )}
                          {bWon && <span className="ml-1">{"\uD83D\uDC51"}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {match.category?.name || ""}
                        </p>
                      </div>
                      <Badge className={cn("text-[10px] capitalize shrink-0", statusColor(match.status))} variant="outline">
                        {match.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No matches yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{formatAction(log.action)}</p>
                      <p className="text-xs text-muted-foreground">{formatTimeAgo(log.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No activity yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
