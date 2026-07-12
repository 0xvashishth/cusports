import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardLayout } from "@/components/dashboard-layout";
import type { Profile, BracketMatch, FixturesConfig } from "@/lib/types";
import { TournamentDetailClient } from "../../../tournaments/[id]/tournament-detail-client";

export default async function DashboardTournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!org) notFound();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (!tournament) notFound();

  const { data: categories } = await supabase
    .from("tournament_categories")
    .select("*, category:categories(*)")
    .eq("tournament_id", id);

  // Load bracket matches
  const tcIds = (categories || []).map((tc: { id: string }) => tc.id);
  let bracketMatches: BracketMatch[] = [];
  if (tcIds.length > 0) {
    const { data: bm } = await adminClient
      .from("bracket_matches")
      .select("*")
      .in("tournament_category_id", tcIds)
      .order("round_number");
    bracketMatches = (bm || []) as BracketMatch[];

    // Fetch match_games for all bracket matches
    const bmIds = bracketMatches.map((m) => m.id);
    if (bmIds.length > 0) {
      const { data: games } = await adminClient
        .from("match_games")
        .select("*")
        .in("bracket_match_id", bmIds);

      const gamesByMatchId = new Map<string, typeof bracketMatches[0]["games"]>();
      for (const game of games || []) {
        const bmId = (game as Record<string, unknown>).bracket_match_id as string;
        if (!gamesByMatchId.has(bmId)) {
          gamesByMatchId.set(bmId, []);
        }
        gamesByMatchId.get(bmId)!.push(game as never);
      }
      bracketMatches = bracketMatches.map((m) => ({
        ...m,
        games: gamesByMatchId.get(m.id) || [],
      }));
    }
  }

  // Load fixtures configs
  const { data: fixturesConfigs } = tcIds.length > 0
    ? await adminClient
        .from("fixtures_config")
        .select("*")
        .in("tournament_category_id", tcIds)
    : { data: [] };

  // Load player profiles for name resolution
  const playerIds = [
    ...new Set(
      bracketMatches
        .flatMap((m) => [m.player_a_id, m.player_b_id])
        .filter(Boolean) as string[]
    ),
  ];
  const { data: profiles } = playerIds.length > 0
    ? await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", playerIds)
    : { data: [] };

  const playerNameMap = new Map<string, string>();
  for (const p of (profiles || []) as { id: string; full_name: string | null }[]) {
    if (p.full_name) playerNameMap.set(p.id, p.full_name);
  }

  const { data: entries } = await adminClient
    .from("tournament_entries")
    .select("*, profile:profiles(*)")
    .eq("tournament_id", id);

  const { data: members } = await adminClient
    .from("org_members")
    .select("profile:profiles(*)")
    .eq("organization_id", org.id)
    .eq("org_role", "player")
    .eq("status", "active");

  const orgPlayers = ((members || []) as unknown as { profile: Profile }[])
    .map((m) => m.profile)
    .filter(Boolean);

  return (
    <DashboardLayout organization={org}>
      <TournamentDetailClient
        org={org}
        tournament={tournament}
        categories={categories || []}
        initialBracketMatches={bracketMatches}
        initialFixturesConfigs={(fixturesConfigs || []) as FixturesConfig[]}
        initialEntries={entries || []}
        orgPlayers={orgPlayers}
        playerNameMap={playerNameMap}
        isManager={true}
      />
    </DashboardLayout>
  );
}
