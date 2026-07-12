"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, Plus, Swords, Trophy } from "lucide-react"
import type { Match, Organization } from "@/lib/types"

interface MatchResultClientProps {
  org: Organization
  match: Match & { games?: { id: string; game_number: number; score_a: number; score_b: number }[] }
}

export function MatchResultClient({ org, match }: MatchResultClientProps) {
  const router = useRouter()
  const [games, setGames] = useState(
    match.games?.length
      ? match.games.map((g) => ({ score_a: g.score_a, score_b: g.score_b }))
      : [{ score_a: 0, score_b: 0 }]
  )
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function saveResult() {
    setSaving(true)
    const supabase = createClient()

    const matchWins = { a: 0, b: 0 }
    for (const game of games) {
      if (game.score_a > game.score_b) matchWins.a++
      else if (game.score_b > game.score_a) matchWins.b++
    }

    const winnerId = matchWins.a > matchWins.b ? match.player_a_id : match.player_b_id

    const { error } = await supabase
      .from("matches")
      .update({
        status: "completed",
        winner_id: winnerId,
        reported_via: "manager",
        approval_status: "approved",
      })
      .eq("id", match.id)

    if (error) {
      setSaving(false)
      return
    }

    for (let i = 0; i < games.length; i++) {
      const existing = match.games?.[i]
      if (existing) {
        await supabase
          .from("match_games")
          .update({ score_a: games[i].score_a, score_b: games[i].score_b })
          .eq("id", existing.id)
      } else {
        await supabase.from("match_games").insert({
          match_id: match.id,
          game_number: i + 1,
          score_a: games[i].score_a,
          score_b: games[i].score_b,
        })
      }
    }

    await fetch(`/api/org/${org.slug}/rankings/recalculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id }),
    })

    setSaving(false)
    setSubmitted(true)
    router.refresh()
  }

  function addGame() {
    setGames([...games, { score_a: 0, score_b: 0 }])
  }

  function updateGame(index: number, field: "score_a" | "score_b", value: string) {
    const newGames = [...games]
    newGames[index][field] = parseInt(value) || 0
    setGames(newGames)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-green-100 dark:bg-green-950/50 p-4 mb-6">
          <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold">Result Submitted</h2>
        <p className="text-muted-foreground mt-2">
          The match result has been recorded and rankings updated
        </p>
        <Button
          className="mt-6"
          onClick={() => router.push(`/org/${org.slug}/dashboard/tournaments`)}
        >
          Back to Tournaments
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Match Result</h1>
        <p className="text-muted-foreground mt-1">Enter the scores for each game</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Match Details</CardTitle>
            </div>
            <Badge
              variant={
                match.status === "completed"
                  ? "success"
                  : match.status === "ongoing"
                  ? "warning"
                  : "secondary"
              }
            >
              {match.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="text-right">
              <Link href={`/org/${org.slug}/players/${match.player_a_id}`} className="font-semibold text-lg hover:underline">{match.player_a?.full_name || "Player A"}</Link>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Separator orientation="vertical" className="h-8" />
              <span className="text-sm font-medium">vs</span>
              <Separator orientation="vertical" className="h-8" />
            </div>
            <div className="text-left">
              <Link href={`/org/${org.slug}/players/${match.player_b_id}`} className="font-semibold text-lg hover:underline">{match.player_b?.full_name || "Player B"}</Link>
            </div>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {match.tournament && (
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />
                {match.tournament.name}
              </div>
            )}
            {match.category && (
              <Badge variant="outline">{match.category.name}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Game Scores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {games.map((game, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg border bg-muted/20">
              <span className="text-sm font-semibold w-24">
                Game {i + 1}
              </span>
              <div className="flex items-center gap-3 flex-1 justify-center">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Player A</Label>
                  <Input
                    type="number"
                    className="w-20 text-center"
                    value={game.score_a}
                    onChange={(e) => updateGame(i, "score_a", e.target.value)}
                    min={0}
                  />
                </div>
                <span className="text-lg font-bold text-muted-foreground">:</span>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Player B</Label>
                  <Input
                    type="number"
                    className="w-20 text-center"
                    value={game.score_b}
                    onChange={(e) => updateGame(i, "score_b", e.target.value)}
                    min={0}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addGame} className="gap-2 w-full">
            <Plus className="h-4 w-4" />
            Add Game
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={saveResult} disabled={saving} size="lg" className="gap-2">
          {saving ? "Saving..." : "Submit Result"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
