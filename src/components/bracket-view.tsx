"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Swords, Calendar, Loader2, CheckCircle2 } from "lucide-react"
import { formatDate } from "@/lib/utils"
import type { Match } from "@/lib/types"

interface BracketViewProps {
  matches: Match[]
  categories: { id: string; name: string }[]
  slug: string
  isManager: boolean
  onMatchUpdate?: () => void
}

// Ordered from first round to final for bracket display
const ROUND_NAMES = ["Round of 64", "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"]

export function BracketView({ matches, categories, slug, isManager, onMatchUpdate }: BracketViewProps) {
  const [scoreTarget, setScoreTarget] = useState<Match | null>(null)
  const [games, setGames] = useState([{ score_a: 0, score_b: 0 }])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const roundOrder = new Map(ROUND_NAMES.map((n, i) => [n, i]))
  const rounds = [...new Set(matches.filter((m) => m.round).map((m) => m.round!))]
    .sort((a, b) => (roundOrder.get(a) ?? 99) - (roundOrder.get(b) ?? 99))

  async function submitResult() {
    if (!scoreTarget) return
    setSubmitting(true)

    const matchWins = { a: 0, b: 0 }
    for (const game of games) {
      if (game.score_a > game.score_b) matchWins.a++
      else if (game.score_b > game.score_a) matchWins.b++
    }
    const winnerId = matchWins.a > matchWins.b ? scoreTarget.player_a_id : scoreTarget.player_b_id

    const res = await fetch(`/api/org/${slug}/matches/${scoreTarget.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ games, winner_id: winnerId }),
    })

    const data = await res.json()
    if (data.success) {
      setSubmitted(true)
      setTimeout(() => {
        setScoreTarget(null)
        setSubmitted(false)
        setGames([{ score_a: 0, score_b: 0 }])
        onMatchUpdate?.()
      }, 1000)
    }
    setSubmitting(false)
  }

  function openScore(match: Match) {
    setScoreTarget(match)
    if (match.games && match.games.length > 0) {
      setGames(match.games.sort((a, b) => a.game_number - b.game_number).map(g => ({ score_a: g.score_a, score_b: g.score_b })))
    } else {
      setGames([{ score_a: 0, score_b: 0 }])
    }
    setSubmitted(false)
  }

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Swords className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium">No matches generated yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Add players and generate fixtures from the Settings tab
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
        {categories.map((cat) => {
          const catMatches = matches.filter((m) => m.category_id === cat.id)
          if (catMatches.length === 0) return null

          const catRounds = [...new Set(catMatches.filter((m) => m.round).map((m) => m.round!))]
            .sort((a, b) => (roundOrder.get(a) ?? 99) - (roundOrder.get(b) ?? 99))

          return (
            <section key={cat.id}>
              <h3 className="text-lg font-semibold mb-4">{cat.name}</h3>
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-6 min-w-max">
                  {catRounds.map((round) => {
                    const roundMatches = catMatches.filter((m) => m.round === round)
                    const isLast = round === catRounds[catRounds.length - 1]

                    return (
                      <div key={round} className="flex flex-col w-[240px] shrink-0">
                        <div className="h-10 flex items-center justify-center">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center px-2 leading-tight">
                            {round}
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          {roundMatches.map((match, idx) => (
                            <BracketMatchCard
                              key={match.id}
                              match={match}
                              slug={slug}
                              isManager={isManager}
                              matchNumber={isLast ? undefined : idx + 1}
                              onScoreClick={() => openScore(match)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <Dialog open={!!scoreTarget} onOpenChange={(o) => !o && !submitting && setScoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {submitted ? "Result Submitted" : scoreTarget?.games?.length ? "Edit Score" : "Enter Score"}
            </DialogTitle>
          </DialogHeader>

          {submitted ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400 mb-3" />
              <p className="font-semibold">Score recorded!</p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="text-center text-sm font-medium text-muted-foreground mb-2">
                {scoreTarget?.player_a?.full_name} vs {scoreTarget?.player_b?.full_name}
              </div>

              {games.map((game, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  <span className="text-sm font-semibold w-20">Game {i + 1}</span>
                  <div className="flex items-center gap-2 flex-1 justify-center">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{scoreTarget?.player_a?.full_name?.split(" ").pop() || "A"}</Label>
                      <Input
                        type="number"
                        className="w-16 text-center"
                        value={game.score_a}
                        onChange={(e) => {
                          const newGames = [...games]
                          newGames[i] = { ...newGames[i], score_a: parseInt(e.target.value) || 0 }
                          setGames(newGames)
                        }}
                        min={0}
                      />
                    </div>
                    <span className="text-lg font-bold text-muted-foreground">:</span>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{scoreTarget?.player_b?.full_name?.split(" ").pop() || "B"}</Label>
                      <Input
                        type="number"
                        className="w-16 text-center"
                        value={game.score_b}
                        onChange={(e) => {
                          const newGames = [...games]
                          newGames[i] = { ...newGames[i], score_b: parseInt(e.target.value) || 0 }
                          setGames(newGames)
                        }}
                        min={0}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGames([...games, { score_a: 0, score_b: 0 }])}
                  className="text-xs"
                >
                  + Add Game
                </Button>
                {games.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGames(games.slice(0, -1))}
                    className="text-xs text-destructive"
                  >
                    Remove Game
                  </Button>
                )}
              </div>

              <Button onClick={submitResult} disabled={submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                {submitting ? "Submitting..." : "Submit Result"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function BracketMatchCard({
  match, slug, isManager, matchNumber, onScoreClick,
}: {
  match: Match
  slug: string
  isManager: boolean
  matchNumber?: number
  onScoreClick: () => void
}) {
  const isPending = !match.player_a_id || !match.player_b_id
  const isBye = match.player_a_id && match.player_a_id === match.player_b_id
  const completed = match.status === "completed"
  const sortedGames = completed && match.games
    ? [...match.games].sort((a, b) => a.game_number - b.game_number)
    : []

  const aWon = completed && match.winner_id === match.player_a_id
  const bWon = completed && match.winner_id === match.player_b_id
  const aGamesWon = sortedGames.filter((g) => g.score_a > g.score_b).length
  const bGamesWon = sortedGames.filter((g) => g.score_b > g.score_a).length

  return (
    <Card
      className={cn(
        "min-w-[220px]",
        match.status === "ongoing" && "ring-2 ring-primary/20",
        completed && "border-primary/30",
        isPending && "border-dashed opacity-70",
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          {matchNumber && (
            <span className="text-[10px] font-mono text-muted-foreground">#{matchNumber}</span>
          )}
          {completed && (
            <Badge variant="success" className="text-[10px]">Completed</Badge>
          )}
        </div>

        {isPending && !isBye ? (
          <div className="text-sm text-muted-foreground italic text-center py-3">
            <div className="text-sm">TBD</div>
            <div className="text-[10px] mt-1">vs</div>
            <div className="text-sm">TBD</div>
          </div>
        ) : isBye ? (
          <div className="text-sm font-medium text-muted-foreground text-center py-3">
            <Link href={`/org/${slug}/players/${match.player_a_id}`} className="hover:underline">{match.player_a?.full_name || "Player"}</Link> — Bye
          </div>
        ) : sortedGames.length > 0 ? (
          <div
            className="grid text-xs tabular-nums gap-x-1 items-center"
            style={{
              gridTemplateColumns: `1fr repeat(${sortedGames.length}, minmax(22px, auto)) auto`
            }}
          >
            <Link href={`/org/${slug}/players/${match.player_a_id}`} className={cn("font-semibold truncate pr-2 hover:underline", aWon && "text-green-600 dark:text-green-400")}>
              {match.player_a?.full_name || "TBD"}
              {aWon && <span className="ml-1 text-[10px]">{"\uD83D\uDC51"}</span>}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={g.id}
                className={cn("text-center font-mono", g.score_a > g.score_b ? "font-bold text-foreground" : "text-muted-foreground/60")}
              >
                {g.score_a}
              </span>
            ))}
            <span className={cn("text-[10px] text-center", aGamesWon > bGamesWon ? "text-foreground font-semibold" : "text-muted-foreground/50")}>
              {aGamesWon}
            </span>
            <Link href={`/org/${slug}/players/${match.player_b_id}`} className={cn("font-semibold truncate pr-2 hover:underline", bWon && "text-green-600 dark:text-green-400")}>
              {match.player_b?.full_name || "TBD"}
              {bWon && <span className="ml-1 text-[10px]">{"\uD83D\uDC51"}</span>}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={`${g.id}-b`}
                className={cn("text-center font-mono", g.score_b > g.score_a ? "font-bold text-foreground" : "text-muted-foreground/60")}
              >
                {g.score_b}
              </span>
            ))}
            <span className={cn("text-[10px] text-center", bGamesWon > aGamesWon ? "text-foreground font-semibold" : "text-muted-foreground/50")}>
              {bGamesWon}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1.5">
            <Link href={`/org/${slug}/players/${match.player_a_id}`} className="flex-1 font-semibold text-sm truncate text-right hover:underline">
              {match.player_a?.full_name || "TBD"}
            </Link>
            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground">vs</span>
            </div>
            <Link href={`/org/${slug}/players/${match.player_b_id}`} className="flex-1 font-semibold text-sm truncate text-left hover:underline">
              {match.player_b?.full_name || "TBD"}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/40">
          {!isPending && !completed && (
            <Badge
              variant={match.status === "ongoing" ? "warning" : match.status === "walkover" ? "outline" : "secondary"}
              className="text-[10px] capitalize"
            >
              {match.status}
            </Badge>
          )}
          {(isPending || isBye) && !isBye && (
            <Badge variant="outline" className="text-[10px]">Pending</Badge>
          )}
          <div className="flex-1" />
          {isManager && !isPending && !isBye && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={onScoreClick}>
              <Swords className="h-2.5 w-2.5" />
              {match.status === "completed" ? "Edit" : "Score"}
            </Button>
          )}
        </div>

        {match.scheduled_at && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-2.5 w-2.5" />
            {formatDate(match.scheduled_at)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
