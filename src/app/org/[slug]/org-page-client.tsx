"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { OrgThemeProvider, useOrgTheme } from "@/components/theme-provider";
import { formatDate, cn } from "@/lib/utils";
import type {
  Organization,
  Announcement,
  Category,
  Match,
  Ranking,
  Tournament,
} from "@/lib/types";
import {
  Trophy,
  Calendar,
  Clock,
  Medal,
  Zap,
  Play,
  CheckCircle2,
  Megaphone,
} from "lucide-react";

interface OrgPageClientProps {
  org: Organization;
  announcements: Announcement[];
  activeAnnouncements: Announcement[];
  categories: Category[];
  matches: Match[];
  rankings: Ranking[];
  tournaments: Tournament[];
}

export function OrgPageClient({
  org,
  announcements,
  activeAnnouncements,
  categories,
  matches,
  rankings,
  tournaments,
}: OrgPageClientProps) {
  const theme = {
    primaryColor: org.theme?.primaryColor || "#2563eb",
    secondaryColor: org.theme?.secondaryColor || "#f1f5f9",
    accentColor: org.theme?.accentColor || "#f1f5f9",
    logoUrl: org.logo_url,
    bannerUrl: org.banner_url,
  };

  const ongoingMatches = matches.filter((m) => m.status === "ongoing");
  const upcomingMatches = matches.filter((m) => {
    if (m.status === "completed" || m.status === "cancelled") return false;
    if (m.status === "ongoing") return false;
    return true;
  });
  const pastMatches = matches.filter((m) => m.status === "completed");

  return (
    <OrgThemeProvider theme={theme}>
      <OrgPageContent
        org={org}
        announcements={announcements}
        activeAnnouncements={activeAnnouncements}
        categories={categories}
        ongoingMatches={ongoingMatches}
        upcomingMatches={upcomingMatches}
        pastMatches={pastMatches}
        rankings={rankings}
        tournaments={tournaments}
      />
    </OrgThemeProvider>
  );
}

function OrgPageContent({
  org,
  announcements,
  activeAnnouncements,
  categories,
  ongoingMatches,
  upcomingMatches,
  pastMatches,
  rankings,
  tournaments,
}: {
  org: Organization;
  announcements: Announcement[];
  activeAnnouncements: Announcement[];
  categories: Category[];
  ongoingMatches: Match[];
  upcomingMatches: Match[];
  pastMatches: Match[];
  rankings: Ranking[];
  tournaments: Tournament[];
}) {
  const orgTheme = useOrgTheme();
  const tournamentNameById = new Map(
    tournaments.map((tournament) => [tournament.id, tournament.name]),
  );

  const groupMatchesByTournament = (matchesToGroup: Match[]) =>
    Object.values(
      matchesToGroup.reduce<
        Record<
          string,
          { tournamentId: string; tournamentName: string; matches: Match[] }
        >
      >((acc, match) => {
        const tournamentId = match.tournament_id || "unknown";
        const tournamentName =
          tournamentNameById.get(tournamentId) ||
          match.tournament?.name ||
          "Tournament";
        if (!acc[tournamentId]) {
          acc[tournamentId] = { tournamentId, tournamentName, matches: [] };
        }
        acc[tournamentId].matches.push(match);
        return acc;
      }, {}),
    );

  const ongoingByTournament = groupMatchesByTournament(ongoingMatches);
  const upcomingByTournament = groupMatchesByTournament(upcomingMatches);

  const top3Players = (() => {
    const bestByPlayer = new Map<
      string,
      { rating: number; player: NonNullable<Ranking["player"]> }
    >();
    for (const r of rankings) {
      if (!r.player) continue;
      const current = bestByPlayer.get(r.entity_id);
      const rating = r.rating || r.points || 0;
      if (!current || rating > current.rating) {
        bestByPlayer.set(r.entity_id, { rating, player: r.player });
      }
    }
    return Array.from(bestByPlayer.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);
  })();

  return (
    <div>
      {activeAnnouncements.length > 0 && (
        <div
          className="overflow-hidden border-b bg-muted/30"
          style={{ borderColor: `${orgTheme.primaryColor}30` }}
        >
          <div className="flex items-center gap-6 py-2.5 px-4 animate-marquee whitespace-nowrap">
            {[...activeAnnouncements, ...activeAnnouncements].map((a, idx) => {
              const inner = (
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <Zap
                    className="w-4 h-4 shrink-0"
                    style={{ color: orgTheme.primaryColor }}
                  />
                  <span className="font-semibold">{a.title}</span>
                  {a.body && (
                    <span className="text-muted-foreground">
                      &mdash; {a.body}
                    </span>
                  )}
                </span>
              );
              return a.link_url ? (
                <Link
                  key={`${a.id}-${idx}`}
                  href={a.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline shrink-0"
                >
                  {inner}
                </Link>
              ) : (
                <span key={`${a.id}-${idx}`} className="shrink-0">
                  {inner}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${orgTheme.primaryColor} 0%, ${orgTheme.primaryColor}88 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60" />
        {org.banner_url && (
          <img
            src={org.banner_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay"
          />
        )}
        <div className="relative container mx-auto px-4 py-12 md:py-16">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-5">
              {org.logo_url ? (
                <img
                  src={org.logo_url}
                  alt=""
                  className="w-20 h-20 rounded-full border-4 border-white/30 shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-full border-4 border-white/30 shadow-lg bg-white/20 flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">
                  {org.name}
                </h1>
                {org.ranking_config?.tagline && (
                  <p className="text-lg text-white/80 mt-1">
                    {org.ranking_config.tagline as string}
                  </p>
                )}
              </div>
            </div>

            {top3Players.length > 0 && (
              <div className="hidden md:flex flex-col gap-1.5 bg-white/10 backdrop-blur-sm rounded-xl px-5 py-4 border border-white/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-1">
                  Top Players
                </span>
                {top3Players.map((p, i) => (
                  <Link
                    key={p.player.id}
                    href={`/org/${org.slug}/players/${p.player.id}`}
                    className="flex items-center gap-2.5 text-white hover:bg-white/10 rounded-lg px-2 py-1 -mx-2 transition-colors"
                  >
                    <span className="text-lg">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                    </span>
                    <span className="text-sm font-medium truncate max-w-[180px]">
                      {p.player.full_name || p.player.email}
                    </span>
                    <span className="text-xs text-white/60 ml-auto tabular-nums">
                      {p.rating}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <Tabs defaultValue="matches">
          <TabsList className="w-full">
            <TabsTrigger value="matches" className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Matches
            </TabsTrigger>
            <TabsTrigger value="rankings" className="flex items-center gap-2">
              <Medal className="w-4 h-4" />
              Rankings
            </TabsTrigger>
            <TabsTrigger
              value="tournaments"
              className="flex items-center gap-2"
            >
              <Trophy className="w-4 h-4" />
              Tournaments
            </TabsTrigger>
            {announcements.length > 0 && (
              <TabsTrigger
                value="announcements"
                className="flex items-center gap-2"
              >
                <Megaphone className="w-4 h-4" />
                Announcements
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="matches" className="space-y-8">
            {ongoingMatches.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                  </span>
                  Live
                </h3>
                <div className="space-y-4">
                  {Object.values(ongoingByTournament).map((group) => (
                    <div
                      key={group.tournamentId}
                      className="rounded-lg border bg-card p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="font-semibold">
                            {group.tournamentName}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {group.matches.length} live match
                            {group.matches.length === 1 ? "" : "es"}
                          </p>
                        </div>
                        <Badge variant="outline">Live</Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.matches.map((m) => (
                          <MatchCard key={m.id} match={m} slug={org.slug} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="pt-4">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                Upcoming
              </h3>
              {upcomingMatches.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No upcoming matches"
                  description="Check back later for scheduled matches."
                />
              ) : (
                <div className="space-y-4">
                  {Object.values(upcomingByTournament).map((group) => (
                    <div
                      key={group.tournamentId}
                      className="rounded-lg border bg-card p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="font-semibold">
                            {group.tournamentName}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {group.matches.length} upcoming fixture
                            {group.matches.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Badge variant="outline">Upcoming</Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {group.matches.map((m) => (
                          <MatchCard key={m.id} match={m} slug={org.slug} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                Past Results
              </h3>
              {pastMatches.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No completed matches"
                  description="Match results will appear here once played."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pastMatches.map((m) => (
                    <MatchCard key={m.id} match={m} slug={org.slug} />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="rankings" className="space-y-8 pt-4">
            {categories.length === 0 ? (
              <EmptyState
                icon={Medal}
                title="No rankings configured"
                description="Rankings will appear once categories are set up."
              />
            ) : (
              <Tabs
                defaultValue={(() => {
                  const mixedIdx = categories.findIndex(
                    (c) => c.name === "Mixed Singles",
                  );
                  return mixedIdx >= 0
                    ? categories[mixedIdx].id
                    : categories[0]?.id;
                })()}
              >
                <TabsList className="mb-4 flex-wrap">
                  {[...categories]
                    .sort((a, b) => {
                      if (a.name === "Mixed Singles") return -1;
                      if (b.name === "Mixed Singles") return 1;
                      return 0;
                    })
                    .map((cat) => (
                      <TabsTrigger key={cat.id} value={cat.id}>
                        {cat.name}
                      </TabsTrigger>
                    ))}
                </TabsList>
                {categories.map((cat) => {
                  const isMixed =
                    cat.name === "Mixed Doubles" ||
                    cat.name === "Mixed Singles";
                  const catRankings = isMixed
                    ? (() => {
                        const singlesCatIds = categories
                          .filter((c) => !c.is_doubles)
                          .map((c) => c.id);
                        const bestByPlayer = new Map<string, Ranking>();
                        for (const r of rankings.filter((r) =>
                          singlesCatIds.includes(r.category_id),
                        )) {
                          const existing = bestByPlayer.get(r.entity_id);
                          const myRating = r.rating || r.points || 0;
                          if (
                            !existing ||
                            (existing.rating || existing.points || 0) < myRating
                          ) {
                            bestByPlayer.set(r.entity_id, r);
                          }
                        }
                        return [...bestByPlayer.values()].sort(
                          (a, b) =>
                            (b.rating || b.points || 0) -
                            (a.rating || a.points || 0),
                        );
                      })()
                    : rankings
                        .filter((r) => r.category_id === cat.id)
                        .sort(
                          (a, b) =>
                            (b.rating || b.points || 0) -
                            (a.rating || a.points || 0),
                        );
                  return (
                    <TabsContent key={cat.id} value={cat.id}>
                      {catRankings.length === 0 ? (
                        <EmptyState
                          icon={Medal}
                          title="No rankings yet"
                          description="Players need to complete matches to appear here."
                        />
                      ) : (
                        <Card>
                          <CardContent className="p-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">#</TableHead>
                                  <TableHead>Player</TableHead>
                                  <TableHead className="text-right">
                                    Rating
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Played
                                  </TableHead>
                                  <TableHead className="text-right">
                                    W-L
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {catRankings.map((r, i) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-mono text-sm text-muted-foreground">
                                      {getRankDisplay(i)}
                                    </TableCell>
                                    <TableCell>
                                      <Link
                                        href={`/org/${org.slug}/players/${r.entity_id}`}
                                        className="flex items-center gap-3 hover:underline"
                                      >
                                        <Avatar className="h-8 w-8">
                                          <AvatarFallback className="text-xs">
                                            {(r.player?.full_name || "?")
                                              .split(" ")
                                              .map((n) => n[0])
                                              .join("")
                                              .toUpperCase()
                                              .slice(0, 2)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium">
                                          {r.player?.full_name || "Unknown"}
                                        </span>
                                      </Link>
                                    </TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">
                                      {r.rating || r.points || 0}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground tabular-nums">
                                      {r.matches_played}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      <span className="text-green-600 dark:text-green-400 font-medium">
                                        {r.wins}
                                      </span>
                                      <span className="text-muted-foreground mx-1">
                                        -
                                      </span>
                                      <span className="text-red-600 dark:text-red-400 font-medium">
                                        {r.losses}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </TabsContent>

          <TabsContent value="tournaments" className="space-y-8 pt-4">
            {tournaments.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No tournaments yet"
                description="Tournaments will appear here once published."
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {tournaments.map((t) => (
                  <Link
                    key={t.id}
                    href={`/org/${org.slug}/tournaments/${t.id}`}
                  >
                    <Card className="h-full hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg">{t.name}</CardTitle>
                          <Badge
                            variant={
                              t.status === "completed" ? "success" : "secondary"
                            }
                          >
                            {t.status}
                          </Badge>
                        </div>
                        <CardDescription>
                          <div className="flex items-center gap-1 mt-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(t.start_date).toLocaleDateString()} -{" "}
                            {new Date(t.end_date).toLocaleDateString()}
                          </div>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="announcements" className="space-y-4 pt-4">
            <section className="space-y-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                All Announcements
              </h3>
              {(() => {
                const now = new Date().toISOString();
                const visible = announcements
                  .filter((a) => a.starts_at <= now)
                  .sort((a, b) => {
                    const aActive = a.ends_at >= now ? 0 : 1;
                    const bActive = b.ends_at >= now ? 0 : 1;
                    return aActive - bActive;
                  });
                return visible.length > 0 ? (
                  <div className="space-y-5">
                    {visible.map((a) => {
                      const isActive = a.ends_at >= now;
                      const inner = (
                        <Card
                          className="border-l-4 transition-colors hover:bg-muted/50"
                          style={{
                            borderLeftColor: isActive
                              ? orgTheme.primaryColor
                              : undefined,
                          }}
                        >
                          <CardContent className="py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="font-semibold">{a.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {a.body}
                                </p>
                              </div>
                              <Badge
                                variant={isActive ? "success" : "secondary"}
                                className="shrink-0 text-[10px]"
                              >
                                {isActive ? "Active" : "Expired"}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                      return a.link_url ? (
                        <Link
                          key={a.id}
                          href={a.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div key={a.id}>{inner}</div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No announcements yet.
                  </p>
                );
              })()}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MatchCard({ match, slug }: { match: Match; slug: string }) {
  const completed = match.status === "completed";
  const isBye = match.is_bye;
  const sortedGames =
    completed && match.games
      ? [...match.games].sort((a, b) => a.game_number - b.game_number)
      : [];

  const aWon = completed && match.winner_id === match.player_a_id;
  const bWon = completed && match.winner_id === match.player_b_id;
  const aGamesWon = sortedGames.filter((g) => g.score_a > g.score_b).length;
  const bGamesWon = sortedGames.filter((g) => g.score_b > g.score_a).length;

  return (
    <Card
      className={cn(
        "h-full hover:shadow-md transition-shadow",
        match.status === "ongoing" && "ring-2 ring-primary/20",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="text-xs text-muted-foreground min-w-0">
            {match.tournament && (
              <div className="flex items-center gap-1 font-medium truncate">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                {match.tournament.name}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground/60 mt-0.5">
              {match.category?.name}
              {match.round ? ` · ${match.round}` : ""}
            </div>
          </div>
          <Badge
            variant={
              completed
                ? "success"
                : match.status === "ongoing"
                  ? "warning"
                  : "secondary"
            }
            className="capitalize text-[10px] shrink-0"
          >
            {match.status === "ongoing" && (
              <span className="relative flex h-1.5 w-1.5 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500" />
              </span>
            )}
            {match.status}
          </Badge>
        </div>

        {isBye ? (
          <div className="text-sm font-medium text-muted-foreground text-center py-2">
            {match.player_a_id ? (
              <Link
                href={`/org/${slug}/players/${match.player_a_id}`}
                className="hover:underline"
              >
                {match.player_a?.full_name || "TBD"}
              </Link>
            ) : (
              match.player_a?.full_name || "TBD"
            )}{" "}
            — Bye
          </div>
        ) : sortedGames.length > 0 ? (
          <div
            className="grid text-sm tabular-nums gap-x-2 items-center"
            style={{
              gridTemplateColumns: `1fr repeat(${sortedGames.length}, minmax(26px, auto)) auto`,
            }}
          >
            <Link
              href={`/org/${slug}/players/${match.player_a_id}`}
              className={cn(
                "font-semibold truncate hover:underline",
                aWon && "text-green-600 dark:text-green-400",
              )}
            >
              {match.player_a?.full_name || "TBD"}
              {aWon && (
                <span className="ml-1 text-[11px]">{"\uD83D\uDC51"}</span>
              )}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={g.id}
                className={cn(
                  "text-center font-mono text-sm leading-none",
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
                "text-xs text-center font-mono",
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
                "font-semibold truncate hover:underline",
                bWon && "text-green-600 dark:text-green-400",
              )}
            >
              {match.player_b?.full_name || "TBD"}
              {bWon && (
                <span className="ml-1 text-[11px]">{"\uD83D\uDC51"}</span>
              )}
            </Link>
            {sortedGames.map((g) => (
              <span
                key={`${g.id}-b`}
                className={cn(
                  "text-center font-mono text-sm leading-none",
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
                "text-xs text-center font-mono",
                bGamesWon > aGamesWon
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground/50",
              )}
            >
              {bGamesWon}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <Link
              href={`/org/${slug}/players/${match.player_a_id}`}
              className="flex-1 font-semibold text-sm truncate hover:underline text-right"
            >
              {match.player_a?.full_name || "TBD"}
            </Link>
            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground">
                vs
              </span>
            </div>
            <Link
              href={`/org/${slug}/players/${match.player_b_id}`}
              className="flex-1 font-semibold text-sm truncate hover:underline text-left"
            >
              {match.player_b?.full_name || "TBD"}
            </Link>
          </div>
        )}

        {match.scheduled_at && (
          <div className="mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(match.scheduled_at)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getRankDisplay(index: number) {
  if (index === 0) return "1st";
  if (index === 1) return "2nd";
  if (index === 2) return "3rd";
  return `${index + 1}th`;
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}
