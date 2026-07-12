import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, BracketMatch } from "@/lib/types";
import { TournamentDetailClient } from "./tournament-detail-client";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: org } = await adminClient
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!org) notFound();

  const { data: tournament } = await adminClient
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (!tournament) notFound();

  const { data: categories } = await adminClient
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isManager = false;
  if (user) {
    const { data: role } = await supabase.rpc("current_org_role", {
      org_id: org.id,
    });
    isManager = role === "manager";

    if (!isManager) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", user.id)
        .single();
      isManager = profile?.platform_role === "admin";
    }
  }

  if (isManager) {
    redirect(`/org/${slug}/dashboard/tournaments/${id}`);
  }

  return (
    <TournamentDetailClient
      org={org}
      tournament={tournament}
      categories={categories || []}
      initialBracketMatches={bracketMatches}
      initialEntries={entries || []}
      orgPlayers={orgPlayers}
      playerNameMap={playerNameMap}
      isManager={isManager}
    />
  );
}
