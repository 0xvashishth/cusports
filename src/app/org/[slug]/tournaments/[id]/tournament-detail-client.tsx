"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BracketTree } from "@/components/bracket-tree";
import { BracketTreeDouble } from "@/components/bracket-tree-double";
import type {
  Tournament,
  TournamentCategory,
  BracketMatch,
  Profile,
  Organization,
  Category,
  BracketType,
  SeedingMethod,
  ByeHandling,
} from "@/lib/types";
import {
  Calendar,
  Users,
  Swords,
  Settings,
  Play,
  CheckCircle2,
  Plus,
  Loader2,
  UserPlus,
  X,
  RotateCcw,
  Bell,
} from "lucide-react";

interface TournamentDetailClientProps {
  org: Organization;
  tournament: Tournament;
  categories: (TournamentCategory & { category?: Category })[];
  initialBracketMatches: BracketMatch[];
  initialEntries: {
    id: string;
    profile_id: string;
    category_id: string;
    seed: number | null;
    profile?: Profile;
  }[];
  orgPlayers: Profile[];
  playerNameMap: Map<string, string>;
  isManager: boolean;
}

export function TournamentDetailClient({
  org,
  tournament,
  categories,
  initialBracketMatches,
  initialEntries,
  orgPlayers,
  playerNameMap,
  isManager,
}: TournamentDetailClientProps) {
  const router = useRouter();
  const tournamentStatus = tournament.status as string;

  const [entries, setEntries] = useState(initialEntries ?? []);
  const [bracketMatches, setBracketMatches] = useState<BracketMatch[]>(initialBracketMatches ?? []);
  const [activeTab, setActiveTab] = useState("matches");

  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(
    categories[0]?.category_id || "",
  );
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [addingPlayers, setAddingPlayers] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [genCategory, setGenCategory] = useState(
    categories[0]?.category_id || "",
  );
  const [generating, setGenerating] = useState(false);

  // Bracket config state
  const [bracketType, setBracketType] = useState<BracketType>("single_elimination");
  const [seedingMethod, setSeedingMethod] = useState<SeedingMethod>("ranked");
  const [byeHandling, setByeHandling] = useState<ByeHandling>("top_seeds_get_byes");
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [regenCategoryId, setRegenCategoryId] = useState<string | null>(null);
  const [advancingRound, setAdvancingRound] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyingPublished, setNotifyingPublished] = useState(false);

  const [editName, setEditName] = useState(tournament.name);
  const [editStartDate, setEditStartDate] = useState(tournament.start_date);
  const [editEndDate, setEditEndDate] = useState(tournament.end_date);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [entriesRes, bracketRes] = await Promise.all([
      fetch(`/api/org/${org.slug}/tournaments/${tournament.id}/entries`),
      fetch(`/api/org/${org.slug}/matches?tournamentId=${tournament.id}`),
    ]);
    if (entriesRes.ok) {
      const data = await entriesRes.json();
      setEntries(Array.isArray(data) ? data : []);
    }
    if (bracketRes.ok) {
      const data = await bracketRes.json();
      setBracketMatches(Array.isArray(data) ? data : []);
    }
  }, [org.slug, tournament.id]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const tcIds = categories.map((tc) => tc.id);
    if (tcIds.length === 0) return;

    const channel = supabase
      .channel("bracket-matches")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bracket_matches",
        },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [categories, fetchData]);

  // Build playerNameMap from entries
  const resolvedNameMap = useMemo(() => {
    const map = new Map(playerNameMap);
    for (const entry of entries) {
      if (entry.profile?.full_name && entry.profile_id) {
        map.set(entry.profile_id, entry.profile.full_name);
      }
    }
    return map;
  }, [playerNameMap, entries]);

  async function addPlayers() {
    if (!selectedCategory || selectedPlayers.length === 0) return;
    setAddingPlayers(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/entries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileIds: selectedPlayers,
          categoryId: selectedCategory,
        }),
      },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to add players");
      setAddingPlayers(false);
      return;
    }

    setAddingPlayers(false);
    setAddPlayerOpen(false);
    setSelectedPlayers([]);
    await fetchData();
  }

  async function removeEntry(entryId: string) {
    setError(null);
    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/entries`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to remove player");
      return;
    }
    await fetchData();
  }

  async function generateFixtures(force = false) {
    if (!genCategory) return;
    setGenerating(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/generate-fixtures`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: genCategory,
          bracketType,
          seedingMethod,
          byeHandling,
          thirdPlaceMatch: bracketType === "single_elimination" ? thirdPlaceMatch : false,
          force,
        }),
      },
    );

    const data = await res.json();
    if (!res.ok && data.hasCompletedMatches && !force) {
      setRegenCategoryId(genCategory);
      setRegenConfirmOpen(true);
      setGenerating(false);
      return;
    }
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to generate fixtures");
      setGenerating(false);
      return;
    }

    setGenerating(false);
    setGenerateOpen(false);
    await fetchData();
  }

  async function confirmRegen() {
    setRegenConfirmOpen(false);
    if (regenCategoryId) {
      await generateFixtures(true);
    }
    setRegenCategoryId(null);
  }

  async function advanceRound(categoryId: string, tcId: string) {
    setAdvancingRound(tcId);
    setError(null);
    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/advance-round`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      },
    );
    const data = await res.json();
    if (data.success) {
      await fetchData();
    } else {
      setError(data.error || "Failed to advance round");
    }
    setAdvancingRound(null);
  }

  async function publishTournament() {
    setPublishing(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to publish tournament");
      setPublishing(false);
      return;
    }

    setPublishing(false);
    router.refresh();
  }

  async function updateTournament() {
    setSaving(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          start_date: editStartDate,
          end_date: editEndDate,
        }),
      },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to update tournament");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  }

  async function notifyCompletion() {
    setNotifying(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/notify-completion`,
      { method: "POST" },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to send notification");
    }
    setNotifying(false);
  }

  async function notifyPublished() {
    setNotifyingPublished(true);
    setError(null);

    const res = await fetch(
      `/api/org/${org.slug}/tournaments/${tournament.id}/notify-published`,
      { method: "POST" },
    );

    const data = await res.json();
    if (!res.ok || !data.success) {
      setError(data.error || "Failed to send notification");
    }
    setNotifyingPublished(false);
  }

  const safeEntries = entries ?? [];
  const safeBracketMatches = bracketMatches ?? [];

  const entriesByCategory = new Map<string, typeof safeEntries>();
  for (const cat of categories) {
    const catEntries = safeEntries.filter(
      (e) => e.category_id === cat.category_id,
    );
    entriesByCategory.set(cat.category_id, catEntries);
  }

  const matchesByCategory = new Map<string, BracketMatch[]>();
  for (const cat of categories) {
    const catMatches = safeBracketMatches.filter(
      (m) => m.tournament_category_id === cat.id,
    );
    matchesByCategory.set(cat.category_id, catMatches);
  }

  const hasFixtures = safeBracketMatches.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-bold">
              {tournament.name}
            </h1>
            <Badge
              variant={
                tournament.status === "completed"
                  ? "success"
                  : tournament.status === "in_progress"
                    ? "warning"
                    : tournament.status === "published"
                      ? "default"
                      : "secondary"
              }
              className="text-sm capitalize"
            >
              {tournament.status === "in_progress" ? "In Progress" : tournament.status}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date(tournament.start_date).toLocaleDateString()} —{" "}
            {new Date(tournament.end_date).toLocaleDateString()}
          </p>
        </div>
        {isManager && tournament.status === "draft" && (
          <Button
            onClick={publishTournament}
            disabled={publishing}
            className="gap-2"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {publishing ? "Publishing..." : "Publish Tournament"}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </p>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                Tournament overview
              </p>
              <p className="text-sm text-muted-foreground">
                {categories.length} category
                {categories.length === 1 ? "" : "ies"} • {safeEntries.length}{" "}
                enrolled player{safeEntries.length === 1 ? "" : "s"} •{" "}
                {safeBracketMatches.length} bracket match
                {safeBracketMatches.length === 1 ? "" : "es"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{tournament.status}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matches" className="flex items-center gap-2">
            <Swords className="h-4 w-4" />
            Matches
          </TabsTrigger>
          <TabsTrigger value="players" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Players
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="matches" className="space-y-8 pt-6">
          <div className="flex items-end justify-between">
            <div className="text-sm text-muted-foreground">
              {safeBracketMatches.length} match{safeBracketMatches.length !== 1 ? "es" : ""} across {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            </div>
            <div className="flex items-center gap-2">
              {safeBracketMatches.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => { fetchData(); }}>
                  Refresh
                </Button>
              )}
            </div>
          </div>

          {hasFixtures ? (
            categories.map((tc) => {
              const catMatches = matchesByCategory.get(tc.category_id) || [];
              if (catMatches.length === 0) return null;
              const isDE = catMatches.some(
                (m) => m.bracket_side === "winners" || m.bracket_side === "losers",
              );
              return (
                <section key={tc.id}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{tc.category?.name || "Unknown"}</h3>
                      <Badge variant="outline" className="text-xs">
                        {isDE ? "Double Elimination" : "Single Elimination"}
                      </Badge>
                    </div>
                    {isManager && catMatches.some(m => m.status === "pending" && m.player_a_id && m.player_b_id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => advanceRound(tc.category_id, tc.id)}
                        disabled={advancingRound === tc.id}
                        className="gap-2"
                      >
                        {advancingRound === tc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {advancingRound === tc.id ? "Advancing..." : "Start Next Round"}
                      </Button>
                    )}
                  </div>
                  {isDE ? (
                    <BracketTreeDouble
                      bracketMatches={catMatches}
                      slug={org.slug}
                      isManager={isManager}
                      onMatchUpdate={fetchData}
                      playerNameMap={resolvedNameMap}
                    />
                  ) : (
                    <BracketTree
                      bracketMatches={catMatches}
                      slug={org.slug}
                      isManager={isManager}
                      onMatchUpdate={fetchData}
                      playerNameMap={resolvedNameMap}
                    />
                  )}
                </section>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Swords className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No matches generated yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add players and generate fixtures from the Settings tab
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="players" className="space-y-6 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Enrolled Players</h2>
            {isManager && tournament.status === "published" && (
              <Button onClick={() => setAddPlayerOpen(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Players
              </Button>
            )}
          </div>

          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No categories</p>
            </div>
          ) : (
            <Tabs defaultValue={categories[0]?.category_id}>
              <TabsList className="mb-6 flex-wrap">
                {categories.map((tc) => (
                  <TabsTrigger key={tc.category_id} value={tc.category_id}>
                    {tc.category?.name || "Unknown"}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((tc) => {
                const catEntries = entriesByCategory.get(tc.category_id) || [];
                return (
                  <TabsContent key={tc.category_id} value={tc.category_id}>
                    {catEntries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-base font-medium">
                          No players enrolled
                        </p>
                        {isManager && tournament.status === "published" && (
                          <Button
                            variant="outline"
                            className="mt-3 gap-2"
                            onClick={() => setAddPlayerOpen(true)}
                          >
                            <Plus className="h-4 w-4" />
                            Add Players
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {catEntries.map((entry) => (
                          <Card key={entry.id} className="bg-muted/30">
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {(entry.profile?.full_name || "?")
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .toUpperCase()
                                      .slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <Link href={`/org/${org.slug}/players/${entry.profile_id}`} className="hover:underline">
                                  <span className="font-medium text-sm">
                                    {entry.profile?.full_name || "Unknown"}
                                  </span>
                                </Link>
                              </div>
        {isManager && tournamentStatus === "published" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeEntry(entry.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </TabsContent>

        {isManager && tournamentStatus !== "draft" && (
          <TabsContent value="settings" className="space-y-6 pt-6">
            {tournamentStatus === "published" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Swords className="h-5 w-5 text-primary" />
                    Generate Fixtures
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Configure bracket settings and generate fixtures for each category.
                    Players are seeded so top-rated players are spread across the bracket.
                  </p>

                  <div className="space-y-3">
                    <Label>Category</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={genCategory}
                      onChange={(e) => setGenCategory(e.target.value)}
                    >
                      {categories.map((tc) => {
                        const hasExisting = matchesByCategory.get(tc.category_id || "")?.length || 0;
                        return (
                          <option key={tc.category_id} value={tc.category_id}>
                            {tc.category?.name || "Unknown"}
                            {hasExisting > 0 ? ` (${hasExisting} matches)` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Bracket Type</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={bracketType}
                        onChange={(e) => setBracketType(e.target.value as BracketType)}
                      >
                        <option value="single_elimination">Single Elimination</option>
                        <option value="double_elimination">Double Elimination</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Seeding</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={seedingMethod}
                        onChange={(e) => setSeedingMethod(e.target.value as SeedingMethod)}
                      >
                        <option value="ranked">By Ranking</option>
                        <option value="random">Random</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Bye Handling</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={byeHandling}
                        onChange={(e) => setByeHandling(e.target.value as ByeHandling)}
                      >
                        <option value="top_seeds_get_byes">Top Seeds Get Byes</option>
                        <option value="random_byes">Random Byes</option>
                      </select>
                    </div>

                    {bracketType === "single_elimination" && (
                      <div className="space-y-2">
                        <Label>Third Place Match</Label>
                        <div className="flex items-center h-10">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={thirdPlaceMatch}
                              onChange={(e) => setThirdPlaceMatch(e.target.checked)}
                              className="rounded border-input"
                            />
                            <span className="text-sm">Enable 3rd place playoff</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {bracketType === "double_elimination" && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Double elimination: losers bracket final feeds directly into the Grand Final. Tournament concludes when the Grand Final is played.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => setGenerateOpen(true)}
                      disabled={generating}
                      className="gap-2"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {generating ? "Generating..." : "Generate Fixtures"}
                    </Button>
                    {safeBracketMatches.length > 0 && (
                      <Button variant="outline" onClick={fetchData}>
                        Refresh
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Edit Tournament
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <input
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <input
                        type="date"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <input
                        type="date"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={updateTournament}
                    disabled={saving || !editName.trim()}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Current status</span>
                  <Badge
                    variant={
                      tournamentStatus === "completed"
                        ? "success"
                        : tournamentStatus === "in_progress"
                          ? "warning"
                          : tournamentStatus === "published"
                            ? "default"
                            : "secondary"
                    }
                  >
                    {tournamentStatus === "in_progress" ? "In Progress" : tournamentStatus}
                  </Badge>
                </div>
                {tournamentStatus === "draft" && (
                  <Button
                    onClick={publishTournament}
                    disabled={publishing}
                    className="w-full gap-2"
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {publishing ? "Publishing..." : "Publish Tournament"}
                  </Button>
                )}
              </CardContent>
            </Card>

            {tournamentStatus === "published" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    Notify Publication
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Send a Slack notification to announce the tournament. Players can react with ✅ to register.
                  </p>
                  <Button
                    onClick={notifyPublished}
                    disabled={notifyingPublished}
                    className="w-full gap-2"
                  >
                    {notifyingPublished ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                    {notifyingPublished ? "Sending..." : "Notify Publication"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {tournamentStatus === "completed" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    Notify Completion
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Send a Slack notification with the tournament results and category winners.
                  </p>
                  <Button
                    onClick={notifyCompletion}
                    disabled={notifying}
                    className="w-full gap-2"
                  >
                    {notifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                    {notifying ? "Sending..." : "Notify Completion"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={addPlayerOpen} onOpenChange={setAddPlayerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Players</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map((tc) => (
                  <option key={tc.category_id} value={tc.category_id}>
                    {tc.category?.name || "Unknown"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Players</Label>
              <div className="border rounded-lg max-h-60 overflow-y-auto p-2 space-y-1">
                {orgPlayers
                  .filter(
                    (p) =>
                      !entries.some(
                        (e) =>
                          e.profile_id === p.id &&
                          e.category_id === selectedCategory,
                      ),
                  )
                  .map((player) => (
                    <label
                      key={player.id}
                      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlayers.includes(player.id)}
                        onChange={() => {
                          setSelectedPlayers((prev) =>
                            prev.includes(player.id)
                              ? prev.filter((id) => id !== player.id)
                              : [...prev, player.id],
                          );
                        }}
                        className="rounded border-input"
                      />
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">
                          {(player.full_name || "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {player.full_name || "Unknown"}
                    </label>
                  ))}
                {orgPlayers.filter(
                  (p) =>
                    !entries.some(
                      (e) =>
                        e.profile_id === p.id &&
                        e.category_id === selectedCategory,
                    ),
                ).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    All players are already enrolled in this category
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={addPlayers}
              disabled={addingPlayers || selectedPlayers.length === 0}
              className="w-full gap-2"
            >
              {addingPlayers ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {addingPlayers
                ? "Adding..."
                : `Add ${selectedPlayers.length} Player${selectedPlayers.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={generateOpen}
        onOpenChange={(o) => !o && setGenerateOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Fixtures</AlertDialogTitle>
            <AlertDialogDescription>
              This will create {bracketType === "single_elimination" ? "single elimination" : "double elimination"} matches
              for the selected category using {seedingMethod} seeding.
              {categories.find((tc) => tc.category_id === genCategory) && (
                <span className="block mt-2">
                  Category:{" "}
                  <strong>
                    {
                      categories.find((tc) => tc.category_id === genCategory)
                        ?.category?.name
                    }
                  </strong>
                  &nbsp;| Players enrolled:{" "}
                  <strong>
                    {(entriesByCategory.get(genCategory) || []).length}
                  </strong>
                </span>
              )}
              {matchesByCategory.get(genCategory)?.length ? (
                <span className="block mt-1 text-destructive font-medium">
                  This category already has fixtures. They will be replaced.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => generateFixtures(false)} disabled={generating}>
              {generating ? "Generating..." : "Generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={regenConfirmOpen}
        onOpenChange={(o) => !o && setRegenConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reset & Regenerate
            </AlertDialogTitle>
            <AlertDialogDescription>
              Some matches in this category have already been completed.
              Regenerating will <strong>delete all existing match results</strong> and
              recreate the bracket from scratch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRegen}
            >
              Reset & Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
