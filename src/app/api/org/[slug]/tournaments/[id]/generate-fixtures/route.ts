import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateBracket, type Participant } from "@/lib/bracket-engine"
import { activatePendingMatches } from "@/lib/advance-match"
import type { BracketType, SeedingMethod, ByeHandling } from "@/lib/types"

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = createAdminClient()

  const { data: org } = await adminClient
    .from("organizations")
    .select("id, ranking_model")
    .eq("slug", slug)
    .single()

  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.platform_role !== "manager" && profile.platform_role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const {
    categoryId,
    bracketType = "single_elimination" as BracketType,
    seedingMethod = "ranked" as SeedingMethod,
    byeHandling = "top_seeds_get_byes" as ByeHandling,
    thirdPlaceMatch = false,
  } = body

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 })
  }

  // Check if fixtures already exist — block if any bracket_matches exist for this category
  const { data: existingBracketMatches } = await adminClient
    .from("bracket_matches")
    .select("id")
    .eq("tournament_category_id", categoryId)
    .limit(1)

  if (existingBracketMatches && existingBracketMatches.length > 0) {
    // Check if any matches are completed — if so, require confirmation
    const { data: completedMatches } = await adminClient
      .from("bracket_matches")
      .select("id")
      .eq("tournament_category_id", categoryId)
      .in("status", ["completed", "walkover"])
      .limit(1)

    if (completedMatches && completedMatches.length > 0) {
      const force = body.force === true
      if (!force) {
        return NextResponse.json({
          error: "Matches already played. Pass force=true to reset and regenerate.",
          hasCompletedMatches: true,
        }, { status: 400 })
      }

      // Force regen: cascade delete existing bracket data
      await adminClient
        .from("match_games")
        .delete()
        .in("bracket_match_id",
          (await adminClient
            .from("bracket_matches")
            .select("id")
            .eq("tournament_category_id", categoryId)
          ).data?.map((m: { id: string }) => m.id) || []
        )

      await adminClient
        .from("bracket_matches")
        .delete()
        .eq("tournament_category_id", categoryId)
    } else {
      // No completed matches, safe to regenerate
      await adminClient
        .from("bracket_matches")
        .delete()
        .eq("tournament_category_id", categoryId)
    }
  }

  // Fetch tournament entries for this category
  const { data: entries } = await adminClient
    .from("tournament_entries")
    .select("profile_id")
    .eq("tournament_id", id)
    .eq("category_id", categoryId)

  if (!entries || entries.length < 2) {
    return NextResponse.json({ error: "Need at least 2 players in this category to generate fixtures" }, { status: 400 })
  }

  // Build participant list
  let participants: Participant[]

  if (seedingMethod === "ranked") {
    const { data: rankings } = await adminClient
      .from("rankings")
      .select("entity_id, rating, points")
      .eq("organization_id", org.id)
      .eq("category_id", categoryId)
      .eq("entity_type", "player")

    const rankingMap = new Map<string, number>()
    if (rankings) {
      for (const r of rankings) {
        rankingMap.set(r.entity_id, r.rating || r.points || 1000)
      }
    }

    participants = entries
      .map((e) => ({
        id: e.profile_id,
        entityType: "player" as const,
      }))
      .sort((a, b) => (rankingMap.get(b.id) || 1000) - (rankingMap.get(a.id) || 1000))
  } else {
    // random or manual — just use the entries in their current order
    participants = entries.map((e) => ({
      id: e.profile_id,
      entityType: "player" as const,
    }))
  }

  // Generate bracket
  const bracket = generateBracket(participants, bracketType, {
    seedingMethod,
    byeHandling,
    thirdPlaceMatch,
  })

  if (bracket.matches.length === 0) {
    return NextResponse.json({ error: "Could not generate fixtures" }, { status: 400 })
  }

  // Create fixtures_config record
  const { data: tc } = await adminClient
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", id)
    .eq("category_id", categoryId)
    .single()

  if (!tc) {
    return NextResponse.json({ error: "Tournament category not found" }, { status: 404 })
  }

  const { error: configError } = await adminClient
    .from("fixtures_config")
    .upsert({
      tournament_category_id: tc.id,
      bracket_type: bracketType,
      seeding_method: seedingMethod,
      bye_handling: byeHandling,
      third_place_match: thirdPlaceMatch,
      generated_at: new Date().toISOString(),
    }, { onConflict: "tournament_category_id" })

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 })
  }

  // Create seed records
  const seedInserts = participants.map((p, i) => ({
    tournament_category_id: tc.id,
    entity_id: p.id,
    entity_type: p.entityType,
    seed_number: i + 1,
  }))

  // Delete existing seeds for this category
  await adminClient
    .from("seeds")
    .delete()
    .eq("tournament_category_id", tc.id)

  const { error: seedError } = await adminClient
    .from("seeds")
    .insert(seedInserts)

  if (seedError) {
    return NextResponse.json({ error: seedError.message }, { status: 500 })
  }

  // Insert bracket matches
  // We need to do a two-pass insert: first get IDs, then update next_match pointers
  const matchInserts = bracket.matches.map((m) => ({
    tournament_category_id: tc.id,
    bracket_side: m.bracketSide,
    round_number: m.roundNumber,
    match_index: m.matchIndex,
    player_a_id: m.playerAId,
    player_a_type: m.playerAType,
    player_b_id: m.playerBId,
    player_b_type: m.playerBType,
    is_bye: m.isBye,
    status: m.status,
    winner_id: m.winnerId,
  }))

  const { data: insertedMatches, error: insertError } = await adminClient
    .from("bracket_matches")
    .insert(matchInserts)
    .select("id, bracket_side, round_number, match_index")

  if (insertError || !insertedMatches) {
    return NextResponse.json({ error: insertError?.message || "Failed to insert matches" }, { status: 500 })
  }

  // Build a lookup from (bracketSide, roundNumber, matchIndex) → inserted id
  const matchIdLookup = new Map<string, string>()
  for (const m of insertedMatches) {
    matchIdLookup.set(`${m.bracket_side}:${m.round_number}:${m.match_index}`, m.id)
  }

  // Second pass: update winner_next_match_id and loser_next_match_id
  for (const m of bracket.matches) {
    const currentId = matchIdLookup.get(`${m.bracketSide}:${m.roundNumber}:${m.matchIndex}`)
    if (!currentId) continue

    const updates: Record<string, string | null> = {}

    if (m.winnerNextMatchIndex !== null) {
      const targetSide = m.bracketSide === "grand_final" ? "grand_final" :
        m.bracketSide === "losers" ? "losers" : m.bracketSide === "single" ? "single" : "winners"

      if (m.bracketSide === "grand_final") {
        updates.winner_next_match_id = null
        updates.winner_next_slot = null
      } else if (m.bracketSide === "losers") {
        const targetRound = m.roundNumber + 1
        const targetIndex = m.winnerNextMatchIndex
        const targetKey = `${targetSide}:${targetRound}:${targetIndex}`
        const targetId = matchIdLookup.get(targetKey)
        if (targetId) {
          updates.winner_next_match_id = targetId
          updates.winner_next_slot = m.winnerNextSlot
        }
      } else {
        const targetRound = m.roundNumber + 1
        const targetIndex = m.winnerNextMatchIndex
        const targetKey = `${targetSide}:${targetRound}:${targetIndex}`
        const targetId = matchIdLookup.get(targetKey)
        if (targetId) {
          updates.winner_next_match_id = targetId
          updates.winner_next_slot = m.winnerNextSlot
        }
      }
    }

    // Loser next match
    if (m.loserNextMatchIndex !== null && m.loserNextSlot !== null) {
      if (m.bracketSide === "winners") {
        // WB loser drops to LB
        // Engine sets loserNextMatchIndex = match index within the target LB round.
        // We compute the correct LB round number:
        //   WB R1 → LB round 1 (Type A compression)
        //   WB R(k) for 2 ≤ k < R → LB round 2*(k-1) (Type B drop)
        //   WB R(R) final → last LB round
        let lbTargetRound: number
        if (m.roundNumber === 1) {
          lbTargetRound = 1
        } else if (m.roundNumber === Math.log2(bracket.bracketSize)) {
          lbTargetRound = bracket.totalRounds
        } else {
          lbTargetRound = 2 * (m.roundNumber - 1)
        }
        const targetKeyCorrect = `losers:${lbTargetRound}:${m.loserNextMatchIndex}`
        const targetId = matchIdLookup.get(targetKeyCorrect)
        if (targetId) {
          updates.loser_next_match_id = targetId
          updates.loser_next_slot = m.loserNextSlot
        }
      } else if (m.bracketSide === "losers") {
        updates.loser_next_match_id = null
        updates.loser_next_slot = null
      } else if (m.bracketSide === "third_place") {
        updates.loser_next_match_id = null
        updates.loser_next_slot = null
      }
    }

    // Handle WB final winner → grand final
    if (m.bracketSide === "winners" && m.roundNumber === Math.log2(bracket.bracketSize)) {
      const gfKey = "grand_final:1:0"
      const gfId = matchIdLookup.get(gfKey)
      if (gfId) {
        updates.winner_next_match_id = gfId
        updates.winner_next_slot = "A"
      }
    }

    // Handle last LB round winner → grand final
    if (m.bracketSide === "losers" && m.roundNumber === bracket.totalRounds && m.matchIndex === 0) {
      const gfKey = "grand_final:1:0"
      const gfId = matchIdLookup.get(gfKey)
      if (gfId) {
        updates.winner_next_match_id = gfId
        updates.winner_next_slot = "B"
      }
    }

    // Handle third place match loser_next from semifinals
    if (m.bracketSide === "winners" && m.roundNumber === Math.log2(bracket.bracketSize) - 1) {
      const tpKey = "third_place:1:0"
      const tpId = matchIdLookup.get(tpKey)
      if (tpId) {
        updates.loser_next_match_id = tpId
        updates.loser_next_slot = m.matchIndex === 0 ? "A" : "B"
      }
    }

    if (Object.keys(updates).length > 0) {
      await adminClient
        .from("bracket_matches")
        .update(updates)
        .eq("id", currentId)
    }
  }

  // Activate any pending matches that already have both players (e.g. from byes)
  await activatePendingMatches(tc.id)

  // Note: LB bye detection (auto-completing matches with only 1 possible player)
  // is handled at runtime in advanceMatch, not here. At generation time no matches
  // have been played yet, so we cannot distinguish "waiting for opponent" from "bye".

  return NextResponse.json({
    success: true,
    matchCount: insertedMatches.length,
    bracketType,
    participantCount: bracket.participantCount,
  })
}
