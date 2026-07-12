import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMatchesWithDetails } from "@/lib/matches";
import { OrgPageClient } from "./org-page-client";
import type { Match, Category, Profile, Ranking } from "@/lib/types";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const adminClient = createAdminClient();

  const { data: org } = await adminClient
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!org) notFound();

  const now = new Date().toISOString();

  const { data: allAnnouncements } = await adminClient
    .from("announcements")
    .select("*")
    .eq("organization_id", org.id)
    .order("starts_at", { ascending: false });

  const activeAnnouncements = (allAnnouncements || []).filter(
    (a: { starts_at: string; ends_at: string }) => a.starts_at <= now && a.ends_at >= now
  );

  const { data: categories } = await adminClient
    .from("categories")
    .select("*")
    .eq("organization_id", org.id);

  const { data: tournamentsData } = await adminClient
    .from("tournaments")
    .select("*")
    .eq("organization_id", org.id)
    .in("status", ["published", "completed"])
    .order("start_date", { ascending: false });

  const legacyMatches = await loadMatchesWithDetails(adminClient, {
    organizationId: org.id,
    orderBy: "scheduled_at",
  });

  // Load bracket matches from published/completed tournaments
  let bracketMatchesAsMatches: Match[] = [];
  if (tournamentsData && tournamentsData.length > 0) {
    const tournamentIds = tournamentsData.map((t: { id: string }) => t.id);

    // Get tournament_categories for these tournaments
    const { data: tcs } = await adminClient
      .from("tournament_categories")
      .select("id, tournament_id, category_id")
      .in("tournament_id", tournamentIds);

    if (tcs && tcs.length > 0) {
      const tcIds = tcs.map((tc: { id: string }) => tc.id);
      const tcMap = new Map(tcs.map((tc: { id: string; tournament_id: string; category_id: string }) => [tc.id, tc]));

      const { data: bm } = await adminClient
        .from("bracket_matches")
        .select("*")
        .in("tournament_category_id", tcIds)
        .order("scheduled_at", { ascending: false });

      if (bm && bm.length > 0) {
        // Fetch match_games
        const bmIds = bm.map((m: { id: string }) => m.id);
        const { data: games } = await adminClient
          .from("match_games")
          .select("*")
          .in("bracket_match_id", bmIds);

        const gamesByMatchId = new Map<string, typeof games>();
        for (const game of games || []) {
          const matchId = (game as Record<string, unknown>).bracket_match_id as string;
          if (!gamesByMatchId.has(matchId)) gamesByMatchId.set(matchId, []);
          gamesByMatchId.get(matchId)!.push(game);
        }

        // Compute round labels
        const ROUND_LABELS: Record<number, string> = {
          1: "Final",
          2: "Semi-finals",
          3: "Quarter-finals",
          4: "Round of 16",
          5: "Round of 32",
          6: "Round of 64",
        };
        const maxRoundSingle = Math.max(
          ...bm
            .filter((m: { bracket_side: string }) => m.bracket_side === "single")
            .map((m: { round_number: number }) => m.round_number),
          0,
        );
        const maxRoundWinners = Math.max(
          ...bm
            .filter((m: { bracket_side: string }) => m.bracket_side === "winners")
            .map((m: { round_number: number }) => m.round_number),
          0,
        );
        const maxRoundLosers = Math.max(
          ...bm
            .filter((m: { bracket_side: string }) => m.bracket_side === "losers")
            .map((m: { round_number: number }) => m.round_number),
          0,
        );

        function getRoundLabel(bracketSide: string, roundNumber: number): string {
          if (bracketSide === "single") {
            const fromFinal = maxRoundSingle - roundNumber + 1;
            return ROUND_LABELS[fromFinal] || `R${roundNumber}`;
          }
          if (bracketSide === "winners") {
            const fromFinal = maxRoundWinners - roundNumber + 1;
            return ROUND_LABELS[fromFinal] || `WB R${roundNumber}`;
          }
          if (bracketSide === "losers") {
            const fromFinal = maxRoundLosers - roundNumber + 1;
            return `LB ${ROUND_LABELS[fromFinal] || `R${roundNumber}`}`;
          }
          if (bracketSide === "grand_final") return "Grand Final";
          if (bracketSide === "grand_final_reset") return "Grand Final Reset";
          if (bracketSide === "third_place") return "3rd Place";
          return "";
        }

        // Fetch player profiles
        const playerIds = [...new Set(
          bm.flatMap((m: { player_a_id: string | null; player_b_id: string | null }) => [m.player_a_id, m.player_b_id]).filter(Boolean) as string[]
        )];
        const { data: profiles } = playerIds.length > 0
          ? await adminClient.from("profiles").select("id, full_name, email, platform_role, created_at").in("id", playerIds)
          : { data: [] };
        const profileMap = new Map((profiles || []).map((p: Record<string, unknown>) => [p.id, p]));

        // Fetch category names
        const catIds = [...new Set(tcs.map((tc: { category_id: string }) => tc.category_id))];
        const { data: cats } = catIds.length > 0
          ? await adminClient.from("categories").select("id, name, is_doubles").in("id", catIds)
          : { data: [] };
        const catMap = new Map((cats || []).map((c: Record<string, unknown>) => [c.id, c]));

        // Convert bracket matches to Match format
        bracketMatchesAsMatches = bm.map((m: Record<string, unknown>) => {
          const tcInfo = tcMap.get(m.tournament_category_id as string);
          return {
            id: m.id as string,
            organization_id: org.id,
            tournament_id: tcInfo?.tournament_id || "",
            category_id: tcInfo?.category_id || "",
            is_bye: (m.is_bye as boolean) || false,
            round: getRoundLabel(m.bracket_side as string, m.round_number as number),
            player_a_id: m.player_a_id as string,
            player_b_id: m.player_b_id as string,
            scheduled_at: m.scheduled_at as string | null,
            status: m.status as string,
            winner_id: m.winner_id as string | null,
            reported_via: "manager" as const,
            approval_status: "n/a" as const,
            created_at: (m.created_at as string) || new Date().toISOString(),
            tournament: tournamentsData.find((t: { id: string }) => t.id === tcInfo?.tournament_id) || null,
            category: catMap.get(tcInfo?.category_id || "") || null,
            player_a: profileMap.get(m.player_a_id as string) || null,
            player_b: profileMap.get(m.player_b_id as string) || null,
            games: (gamesByMatchId.get(m.id as string) || []).map((g: Record<string, unknown>) => ({
              id: g.id as string,
              match_id: null,
              bracket_match_id: g.bracket_match_id as string,
              game_number: g.game_number as number,
              score_a: g.score_a as number,
              score_b: g.score_b as number,
            })),
          } as unknown as Match;
        });
      }
    }
  }

  // Merge legacy and bracket matches, sort by scheduled_at descending
  const allMatches = [...(legacyMatches || []), ...bracketMatchesAsMatches]
    .sort((a, b) => {
      const dateA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const dateB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return dateB - dateA;
    });

  const { data: rankingsData } = await adminClient
    .from("rankings")
    .select("*, category:categories(*)")
    .eq("organization_id", org.id)
    .eq("entity_type", "player");

  const rankingProfileIds = [...new Set((rankingsData || []).map((r: { entity_id: string }) => r.entity_id))];
  const { data: rankingProfiles } = rankingProfileIds.length > 0
    ? await adminClient.from("profiles").select("id, full_name, email, platform_role, created_at").in("id", rankingProfileIds)
    : { data: [] };
  const rankingProfileMap = new Map((rankingProfiles || []).map((p: { id: string; full_name: string | null; email: string | null; platform_role: string | null; created_at: string }) => [p.id, p]));

  // Verify org membership for data consistency
  const { data: orgMembers } = rankingProfileIds.length > 0
    ? await adminClient.from("org_members").select("profile_id").eq("organization_id", org.id).in("profile_id", rankingProfileIds)
    : { data: [] };
  const memberSet = new Set((orgMembers || []).map((m: { profile_id: string }) => m.profile_id));

  // Compute match stats from completed matches
  const { data: allLegacyMatches } = await adminClient
    .from("matches")
    .select("player_a_id, player_b_id, winner_id")
    .eq("organization_id", org.id)
    .eq("status", "completed")
    .not("winner_id", "is", null)

  const { data: tcData2 } = await adminClient.from("tournament_categories").select("id, category_id")
  const tcMap2 = new Map((tcData2 || []).map((tc: { id: string; category_id: string }) => [tc.id, tc.category_id]))

  const { data: allBracketMatches } = await adminClient
    .from("bracket_matches")
    .select("player_a_id, player_b_id, winner_id, tournament_category_id, is_bye")
    .in("status", ["completed", "walkover"])
    .not("winner_id", "is", null)
    .eq("is_bye", false)

  const matchStats = new Map<string, { played: number; wins: number; losses: number }>()
  function addStat(id: string, field: "played" | "wins" | "losses") {
    const s = matchStats.get(id) || { played: 0, wins: 0, losses: 0 }
    s[field]++
    matchStats.set(id, s)
  }

  for (const m of allLegacyMatches || []) {
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

  const rankings = (rankingsData || [])
    .filter((r: { entity_id: string }) => memberSet.has(r.entity_id) && rankingProfileMap.has(r.entity_id))
    .map((r: { entity_id: string }) => {
      const st = matchStats.get(r.entity_id)
      return {
        ...r,
        player: rankingProfileMap.get(r.entity_id) || null,
        matches_played: st?.played ?? (r as Record<string, unknown>).matches_played ?? 0,
        wins: st?.wins ?? (r as Record<string, unknown>).wins ?? 0,
        losses: st?.losses ?? (r as Record<string, unknown>).losses ?? 0,
      }
    }) as Ranking[];

  return (
    <OrgPageClient
      org={org}
      announcements={allAnnouncements || []}
      activeAnnouncements={activeAnnouncements}
      categories={categories || []}
      matches={allMatches}
      rankings={rankings || []}
      tournaments={tournamentsData || []}
    />
  );
}
