import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const adminClient = createAdminClient();

  const { data: org } = await adminClient
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const tournamentId = searchParams.get("tournamentId");
  const categoryId = searchParams.get("categoryId");

  if (tournamentId) {
    const { data: tcs } = await adminClient
      .from("tournament_categories")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (!tcs || tcs.length === 0) {
      return NextResponse.json([]);
    }

    let tcIds = tcs.map((tc: { id: string }) => tc.id);

    if (categoryId) {
      const { data: specificTc } = await adminClient
        .from("tournament_categories")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("category_id", categoryId)
        .single();

      tcIds = specificTc ? [specificTc.id] : [];
    }

    if (tcIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: bracketMatches, error } = await adminClient
      .from("bracket_matches")
      .select("*")
      .in("tournament_category_id", tcIds)
      .order("round_number");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const matches = bracketMatches || [];

    const matchIds = matches.map((m: { id: string }) => m.id);
    const gamesByMatchId = new Map<string, unknown[]>();
    if (matchIds.length > 0) {
      const { data: games } = await adminClient
        .from("match_games")
        .select("*")
        .in("bracket_match_id", matchIds);

      if (games) {
        for (const game of games) {
          const bmId = (game as Record<string, unknown>).bracket_match_id as string;
          if (!gamesByMatchId.has(bmId)) {
            gamesByMatchId.set(bmId, []);
          }
          gamesByMatchId.get(bmId)!.push(game);
        }
      }
    }

    const matchesWithGames = matches.map((m: Record<string, unknown>) => ({
      ...m,
      games: gamesByMatchId.get(m.id as string) || [],
    }));

    return NextResponse.json(matchesWithGames);
  }

  return NextResponse.json([]);
}
