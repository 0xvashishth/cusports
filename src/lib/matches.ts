import type { Match } from "@/lib/types";

type QueryBuilderLike = {
  eq: (column: string, value: unknown) => QueryBuilderLike;
  in: (column: string, values: string[]) => QueryBuilderLike;
  order: (
    column: string,
    options?: { ascending?: boolean; [key: string]: unknown },
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns: string) => QueryBuilderLike;
  };
};

function buildIdList(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

async function fetchByIds(
  client: SupabaseClientLike,
  table: string,
  columns: string,
  ids: string[],
  idColumn = "id",
) {
  if (ids.length === 0) {
    return { data: [] };
  }

  return client.from(table).select(columns).in(idColumn, ids);
}

export async function loadMatchesWithDetails(
  client: SupabaseClientLike,
  options: {
    organizationId?: string;
    tournamentId?: string;
    status?: string;
    categoryId?: string;
    orderBy?: "scheduled_at" | "round";
  } = {},
): Promise<Match[]> {
  const {
    organizationId,
    tournamentId,
    status,
    categoryId,
    orderBy = "scheduled_at",
  } = options;

  let query = client
    .from("matches")
    .select(
      "id, organization_id, tournament_id, category_id, round, player_a_id, player_b_id, scheduled_at, status, winner_id, reported_via, approval_status, created_at",
    );

  if (organizationId) query = query.eq("organization_id", organizationId);
  if (tournamentId) query = query.eq("tournament_id", tournamentId);
  if (status) query = query.eq("status", status);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data: matchesData, error } = await query.order(orderBy, {
    ascending: orderBy === "round",
  });

  if (error) {
    throw new Error(error.message);
  }

  const matches = (matchesData || []) as Match[];

  const tournamentIds = buildIdList(
    matches.map((match) => match.tournament_id),
  );
  const categoryIds = buildIdList(matches.map((match) => match.category_id));
  const playerIds = buildIdList(
    matches.flatMap((match) => [match.player_a_id, match.player_b_id]),
  );
  const matchIds = buildIdList(matches.map((match) => match.id));

  const [profilesResult, categoriesResult, tournamentsResult, gamesResult] =
    await Promise.all([
      fetchByIds(
        client,
        "profiles",
        "id, full_name, email, platform_role, created_at",
        playerIds,
      ),
      fetchByIds(
        client,
        "categories",
        "id, organization_id, name, is_doubles",
        categoryIds,
      ),
      fetchByIds(
        client,
        "tournaments",
        "id, organization_id, name, banner_url, start_date, end_date, status",
        tournamentIds,
      ),
      fetchByIds(
        client,
        "match_games",
        "id, match_id, game_number, score_a, score_b",
        matchIds,
        "match_id",
      ),
    ]);

  const profileMap = new Map(
    ((profilesResult.data || []) as Array<Record<string, unknown>>).map(
      (profile) => [profile.id, profile],
    ),
  );
  const categoryMap = new Map(
    ((categoriesResult.data || []) as Array<Record<string, unknown>>).map(
      (category) => [category.id, category],
    ),
  );
  const tournamentMap = new Map(
    ((tournamentsResult.data || []) as Array<Record<string, unknown>>).map(
      (tournament) => [tournament.id, tournament],
    ),
  );
  const gamesByMatchId = new Map<string, Match["games"]>();
  for (const game of (gamesResult.data || []) as Array<
    Record<string, unknown>
  >) {
    const matchId = game.match_id as string;
    if (!gamesByMatchId.has(matchId)) {
      gamesByMatchId.set(matchId, []);
    }
    gamesByMatchId.get(matchId)?.push(game as Match["games"][number]);
  }

  return matches.map((match) => ({
    ...match,
    tournament: tournamentMap.get(match.tournament_id) as Match["tournament"],
    category: categoryMap.get(match.category_id) as Match["category"],
    player_a: profileMap.get(match.player_a_id) as Match["player_a"],
    player_b: profileMap.get(match.player_b_id) as Match["player_b"],
    games: gamesByMatchId.get(match.id) || [],
  }));
}
