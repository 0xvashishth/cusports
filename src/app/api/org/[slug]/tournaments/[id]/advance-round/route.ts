import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { activatePendingMatches } from "@/lib/advance-match"

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const adminClient = createAdminClient()

  const { data: org } = await adminClient
    .from("organizations")
    .select("id")
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
  const { categoryId } = body

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 })
  }

  // Find tournament_category_id from tournament id + category id
  const { data: tc } = await adminClient
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", id)
    .eq("category_id", categoryId)
    .single()

  if (!tc) {
    return NextResponse.json({ error: "Tournament category not found" }, { status: 404 })
  }

  // Fetch all bracket matches for this category
  const { data: allMatches } = await adminClient
    .from("bracket_matches")
    .select("*")
    .eq("tournament_category_id", tc.id)

  if (!allMatches || allMatches.length === 0) {
    return NextResponse.json({ error: "No bracket matches found" }, { status: 400 })
  }

  // Build a lookup for computing next match positions
  const matchesByKey = new Map<string, typeof allMatches[0]>()
  for (const m of allMatches) {
    matchesByKey.set(`${m.bracket_side}:${m.round_number}:${m.match_index}`, m)
  }

  let fixed = 0

  // For completed matches with a winner but no winner_next_match_id, compute and fill advancement
  for (const m of allMatches) {
    if (!m.winner_id) continue
    if (m.winner_next_match_id) {
      // Already has a pointer — just ensure the slot is filled
      const slotField = m.winner_next_slot === "A" ? "player_a_id" : "player_b_id"
      const { data: nextMatch } = await adminClient
        .from("bracket_matches")
        .select(slotField)
        .eq("id", m.winner_next_match_id)
        .single()
      if (nextMatch && !(nextMatch as Record<string, unknown>)[slotField]) {
        await adminClient
          .from("bracket_matches")
          .update({ [slotField]: m.winner_id })
          .eq("id", m.winner_next_match_id)
        fixed++
      }
      continue
    }

    // No winner_next_match_id — compute it from bracket structure
    if (m.bracket_side === "grand_final") continue

    const targetSide = m.bracket_side === "losers" ? "losers" : m.bracket_side === "single" ? "single" : "winners"
    const targetRound = m.round_number + 1
    const targetIndex = Math.floor(m.match_index / 2)
    const targetKey = `${targetSide}:${targetRound}:${targetIndex}`
    const targetMatch = matchesByKey.get(targetKey)

    if (!targetMatch) continue

    const slot = m.match_index % 2 === 0 ? "A" : "B"
    const slotField = slot === "A" ? "player_a_id" : "player_b_id"
    const slotTypeField = slot === "A" ? "player_a_type" : "player_b_type"

    // Update the current match with advancement pointer
    await adminClient
      .from("bracket_matches")
      .update({
        winner_next_match_id: targetMatch.id,
        winner_next_slot: slot,
      })
      .eq("id", m.id)

    // Fill the winner into the next match's slot if empty
    const { data: target } = await adminClient
      .from("bracket_matches")
      .select(slotField)
      .eq("id", targetMatch.id)
      .single()

    if (target && !(target as Record<string, unknown>)[slotField]) {
      await adminClient
        .from("bracket_matches")
        .update({ [slotField]: m.winner_id, [slotTypeField]: "player" })
        .eq("id", targetMatch.id)
    }

    fixed++
  }

  // Activate any pending matches that now have both players
  const { activated } = await activatePendingMatches(tc.id)

  return NextResponse.json({ success: true, advanced: activated, fixed })
}
