"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Swords,
  Calendar,
  Loader2,
  CheckCircle2,
  Trophy,
  ArrowDown,
} from "lucide-react"
import { formatDate } from "@/lib/utils"
import type {
  BracketMatch,
  BracketSide,
} from "@/lib/types"

interface BracketTreeProps {
  bracketMatches: BracketMatch[]
  slug: string
  isManager: boolean
  onMatchUpdate?: () => void
  playerNameMap?: Map<string, string>
}

interface BracketRound {
  roundNumber: number
  label: string
  matches: BracketMatch[]
}

interface BracketSection {
  side: BracketSide
  label: string
  rounds: BracketRound[]
}

const ROUND_LABELS: Record<number, string> = {
  1: "Final",
  2: "Semi-finals",
  3: "Quarter-finals",
  4: "Round of 16",
  5: "Round of 32",
  6: "Round of 64",
}

function getRoundLabel(roundNumber: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundNumber + 1
  return ROUND_LABELS[fromFinal] || `Round ${roundNumber}`
}

function buildSections(bracketMatches: BracketMatch[]): BracketSection[] {
  const sides = [...new Set(bracketMatches.map((m) => m.bracket_side))]
  const sections: BracketSection[] = []

  // Desired order for display
  const sideOrder: BracketSide[] = ["winners", "losers", "grand_final", "third_place", "single"]

  for (const side of sideOrder) {
    if (!sides.includes(side)) continue
    const sideMatches = bracketMatches.filter((m) => m.bracket_side === side)
    const roundNumbers = [...new Set(sideMatches.map((m) => m.round_number))].sort((a, b) => a - b)
    const maxRound = Math.max(...roundNumbers)

    const rounds: BracketRound[] = roundNumbers.map((rn) => ({
      roundNumber: rn,
      label: getRoundLabel(rn, maxRound),
      matches: sideMatches
        .filter((m) => m.round_number === rn)
        .sort((a, b) => a.match_index - b.match_index),
    }))

    const label =
      side === "winners"
        ? "Winners Bracket"
        : side === "losers"
          ? "Losers Bracket"
          : side === "grand_final"
            ? "Grand Final"
            : side === "third_place"
                ? "Third Place"
                : "Bracket"

    sections.push({ side, label, rounds })
  }

  return sections
}

export function BracketTree({
  bracketMatches,
  slug,
  isManager,
  onMatchUpdate,
  playerNameMap,
}: BracketTreeProps) {
  const [scoreTarget, setScoreTarget] = useState<BracketMatch | null>(null)
  const [games, setGames] = useState<{ score_a: number; score_b: number }[]>([
    { score_a: 0, score_b: 0 },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const sections = buildSections(bracketMatches)

  function openScore(match: BracketMatch) {
    setScoreTarget(match)
    if (match.games && match.games.length > 0) {
      setGames(
        [...match.games]
          .sort((a, b) => a.game_number - b.game_number)
          .map((g) => ({ score_a: g.score_a, score_b: g.score_b })),
      )
    } else {
      setGames([{ score_a: 0, score_b: 0 }])
    }
    setSubmitted(false)
  }

  async function submitResult() {
    if (!scoreTarget) return
    setSubmitting(true)

    const matchWins = { a: 0, b: 0 }
    for (const game of games) {
      if (game.score_a > game.score_b) matchWins.a++
      else if (game.score_b > game.score_a) matchWins.b++
    }
    const winnerId =
      matchWins.a > matchWins.b
        ? scoreTarget.player_a_id
        : scoreTarget.player_b_id
    const loserId =
      matchWins.a > matchWins.b
        ? scoreTarget.player_b_id
        : scoreTarget.player_a_id

    if (!winnerId || !loserId) {
      setSubmitting(false)
      return
    }

    const res = await fetch(`/api/org/${slug}/advance-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bracketMatchId: scoreTarget.id,
        winnerId,
        loserId,
        games: games.map((g, i) => ({
          game_number: i + 1,
          score_a: g.score_a,
          score_b: g.score_b,
        })),
      }),
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

  function getPlayerName(id: string | null): string {
    if (!id) return "TBD"
    return playerNameMap?.get(id) || "Player"
  }

  if (bracketMatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Swords className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium">No fixtures generated yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and generate fixtures from the Settings tab
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-10">
        {sections.map((section) => (
          <BracketSection
            key={section.side}
            section={section}
            slug={slug}
            isManager={isManager}
            onScoreClick={openScore}
            getPlayerName={getPlayerName}
          />
        ))}
      </div>

      <Dialog
        open={!!scoreTarget}
        onOpenChange={(o) => !o && !submitting && setScoreTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {submitted
                ? "Result Submitted"
                : scoreTarget?.games?.length
                  ? "Edit Score"
                  : "Enter Score"}
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
                {getPlayerName(scoreTarget?.player_a_id ?? null)} vs{" "}
                {getPlayerName(scoreTarget?.player_b_id ?? null)}
              </div>

              {games.map((game, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20"
                >
                  <span className="text-sm font-semibold w-20">
                    Game {i + 1}
                  </span>
                  <div className="flex items-center gap-2 flex-1 justify-center">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {getPlayerName(scoreTarget?.player_a_id ?? null)
                          .split(" ")
                          .pop() || "A"}
                      </Label>
                      <Input
                        type="number"
                        className="w-16 text-center"
                        value={game.score_a}
                        onChange={(e) => {
                          const newGames = [...games]
                          newGames[i] = {
                            ...newGames[i],
                            score_a: parseInt(e.target.value) || 0,
                          }
                          setGames(newGames)
                        }}
                        min={0}
                      />
                    </div>
                    <span className="text-lg font-bold text-muted-foreground">
                      :
                    </span>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {getPlayerName(scoreTarget?.player_b_id ?? null)
                          .split(" ")
                          .pop() || "B"}
                      </Label>
                      <Input
                        type="number"
                        className="w-16 text-center"
                        value={game.score_b}
                        onChange={(e) => {
                          const newGames = [...games]
                          newGames[i] = {
                            ...newGames[i],
                            score_b: parseInt(e.target.value) || 0,
                          }
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
                  onClick={() =>
                    setGames([...games, { score_a: 0, score_b: 0 }])
                  }
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

              <Button
                onClick={submitResult}
                disabled={submitting}
                className="w-full gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Swords className="h-4 w-4" />
                )}
                {submitting ? "Submitting..." : "Submit Result"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function BracketSection({
  section,
  slug,
  isManager,
  onScoreClick,
  getPlayerName,
}: {
  section: BracketSection
  slug: string
  isManager: boolean
  onScoreClick: (match: BracketMatch) => void
  getPlayerName: (id: string | null) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const matchRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [connectors, setConnectors] = useState<
    Array<{ from: string; to: string; type: "winner" | "loser" }>
  >([])
  const [connectorPaths, setConnectorPaths] = useState<
    Array<{ key: string; d: string; type: "winner" | "loser" }>
  >([])

  const setMatchRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) matchRefs.current.set(id, el)
      else matchRefs.current.delete(id)
    },
    [],
  )

  // Compute connector lines
  useEffect(() => {
    const timer = setTimeout(() => {
      const newConnectors: Array<{
        from: string
        to: string
        type: "winner" | "loser"
      }> = []

      for (const match of section.rounds.flatMap((r) => r.matches)) {
        if (match.winner_next_match_id) {
          newConnectors.push({
            from: match.id,
            to: match.winner_next_match_id,
            type: "winner",
          })
        }
        if (match.loser_next_match_id) {
          newConnectors.push({
            from: match.id,
            to: match.loser_next_match_id,
            type: "loser",
          })
        }
      }

      setConnectors(newConnectors)
    }, 100)
    return () => clearTimeout(timer)
  }, [section])

  useEffect(() => {
    if (connectors.length === 0) return
    const inner = innerRef.current
    if (!inner) return
    const innerRect = inner.getBoundingClientRect()
    const paths: Array<{ key: string; d: string; type: "winner" | "loser" }> = []
    for (const conn of connectors) {
      const fromEl = matchRefs.current.get(conn.from)
      const toEl = matchRefs.current.get(conn.to)
      if (!fromEl || !toEl) continue
      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()
      const x1 = fromRect.right - innerRect.left
      const y1 = fromRect.top + fromRect.height / 2 - innerRect.top
      const x2 = toRect.left - innerRect.left
      const y2 = toRect.top + toRect.height / 2 - innerRect.top
      const midX = (x1 + x2) / 2
      paths.push({
        key: `${conn.from}-${conn.to}`,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        type: conn.type,
      })
    }
    setConnectorPaths(paths)
  }, [connectors])

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        {section.side === "winners" && (
          <Trophy className="h-4 w-4 text-yellow-500" />
        )}
        {section.side === "losers" && (
          <ArrowDown className="h-4 w-4 text-orange-500" />
        )}
        <h3 className="text-lg font-semibold">{section.label}</h3>
      </div>

      <div className="overflow-x-auto pb-4" ref={containerRef}>
        <div className="relative flex gap-6 min-w-max" ref={innerRef}>
          {/* SVG Connector Lines - inside relative container before rounds so cards overlay */}
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
          >
          {connectorPaths.map((path) => (
              <path
                key={path.key}
                d={path.d}
                fill="none"
                stroke={
                  path.type === "loser"
                    ? "hsl(var(--muted-foreground) / 0.3)"
                    : "hsl(var(--primary) / 0.4)"
                }
                strokeWidth={1.5}
                strokeDasharray={path.type === "loser" ? "4,4" : "none"}
              />
          ))}
        </svg>

          {section.rounds.map((round) => (
            <div
              key={round.roundNumber}
              className="flex flex-col w-[220px] shrink-0"
            >
              <div className="h-10 flex items-center justify-center">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center px-2 leading-tight">
                  {round.label}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <BracketMatchCard
                    key={match.id}
                    match={match}
                    slug={slug}
                    isManager={isManager}
                    onScoreClick={() => onScoreClick(match)}
                    getPlayerName={getPlayerName}
                    ref={(el) => setMatchRef(match.id, el)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const BracketMatchCard = ({
  match,
  slug,
  isManager,
  onScoreClick,
  getPlayerName,
  ref,
}: {
  match: BracketMatch
  slug: string
  isManager: boolean
  onScoreClick: () => void
  getPlayerName: (id: string | null) => string
  ref?: React.Ref<HTMLDivElement>
}) => {
  const isPending = !match.player_a_id || !match.player_b_id
  const isBye = match.is_bye
  const completed = match.status === "completed" || match.status === "walkover"
  const scheduled = match.status === "scheduled"
  const ongoing = match.status === "ongoing"

  const sortedGames =
    completed && match.games
      ? [...match.games].sort((a, b) => a.game_number - b.game_number)
      : []

  const aWon = completed && match.winner_id === match.player_a_id
  const bWon = completed && match.winner_id === match.player_b_id
  const aGamesWon = sortedGames.filter((g) => g.score_a > g.score_b).length
  const bGamesWon = sortedGames.filter((g) => g.score_b > g.score_a).length

  const aName = getPlayerName(match.player_a_id)
  const bName = getPlayerName(match.player_b_id)

  // Build label for TBD matches
  const aLabel = match.player_a_id
    ? aName
    : `TBD`
  const bLabel = match.player_b_id
    ? bName
    : `TBD`

  return (
    <Card
      ref={ref}
      className={cn(
        "min-w-[200px] relative",
        ongoing && "ring-2 ring-primary/20",
        completed && "border-primary/30",
        (isPending && !isBye) && "border-dashed opacity-70",
        isBye && "bg-muted/30",
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {match.bracket_side === "single" || match.bracket_side === "winners"
              ? `M${match.match_index + 1}`
              : match.bracket_side === "losers"
                ? `L${match.round_number}-${match.match_index + 1}`
                : match.bracket_side === "grand_final"
                  ? "GF"
                  : "3P"}
          </span>
          {completed && (
            <Badge
              variant={match.status === "walkover" ? "outline" : "success"}
              className="text-[10px]"
            >
              {match.status === "walkover" ? "Walkover" : "Completed"}
            </Badge>
          )}
          {ongoing && (
            <Badge variant="warning" className="text-[10px]">
              Live
            </Badge>
          )}
        </div>

        {isBye ? (
          <div className="text-sm font-medium text-muted-foreground text-center py-2">
            <Link
              href={`/org/${slug}/players/${match.player_a_id}`}
              className="hover:underline"
            >
              {aName}
            </Link>{" "}
            — Bye
          </div>
        ) : sortedGames.length > 0 ? (
          <div
            className="grid text-xs tabular-nums gap-x-1 items-center"
            style={{
              gridTemplateColumns: `1fr repeat(${sortedGames.length}, minmax(22px, auto)) auto`,
            }}
          >
            <Link
              href={`/org/${slug}/players/${match.player_a_id}`}
              className={cn(
                "font-semibold truncate pr-2 hover:underline",
                aWon && "text-green-600 dark:text-green-400",
              )}
            >
              {aLabel}
              {aWon && <span className="ml-1 text-[10px]">{"\uD83D\uDC51"}</span>}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={g.id}
                className={cn(
                  "text-center font-mono",
                  g.score_a > g.score_b
                    ? "font-bold text-foreground"
                    : "text-muted-foreground/60",
                )}
              >
                {g.score_a}
              </span>
            ))}
            <span
              className={cn(
                "text-[10px] text-center",
                aGamesWon > bGamesWon
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground/50",
              )}
            >
              {aGamesWon}
            </span>
            <Link
              href={`/org/${slug}/players/${match.player_b_id}`}
              className={cn(
                "font-semibold truncate pr-2 hover:underline",
                bWon && "text-green-600 dark:text-green-400",
              )}
            >
              {bLabel}
              {bWon && <span className="ml-1 text-[10px]">{"\uD83D\uDC51"}</span>}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={`${g.id}-b`}
                className={cn(
                  "text-center font-mono",
                  g.score_b > g.score_a
                    ? "font-bold text-foreground"
                    : "text-muted-foreground/60",
                )}
              >
                {g.score_b}
              </span>
            ))}
            <span
              className={cn(
                "text-[10px] text-center",
                bGamesWon > aGamesWon
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground/50",
              )}
            >
              {bGamesWon}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1.5">
            <Link
              href={
                match.player_a_id
                  ? `/org/${slug}/players/${match.player_a_id}`
                  : "#"
              }
              className={cn(
                "flex-1 font-semibold text-sm truncate text-right hover:underline",
                !match.player_a_id && "text-muted-foreground italic",
              )}
            >
              {aLabel}
            </Link>
            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground">
                vs
              </span>
            </div>
            <Link
              href={
                match.player_b_id
                  ? `/org/${slug}/players/${match.player_b_id}`
                  : "#"
              }
              className={cn(
                "flex-1 font-semibold text-sm truncate text-left hover:underline",
                !match.player_b_id && "text-muted-foreground italic",
              )}
            >
              {bLabel}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/40">
          {!isPending && !isBye && !completed && (
            <Badge
              variant={
                ongoing
                  ? "warning"
                  : scheduled
                    ? "secondary"
                    : "outline"
              }
              className="text-[10px] capitalize"
            >
              {match.status}
            </Badge>
          )}
          {isPending && !isBye && (
            <Badge variant="outline" className="text-[10px]">
              Pending
            </Badge>
          )}
          <div className="flex-1" />
          {isManager && !isBye && (scheduled || completed) && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={onScoreClick}
            >
              <Swords className="h-2.5 w-2.5" />
              {completed ? "Edit" : "Score"}
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

BracketMatchCard.displayName = "BracketMatchCard"
