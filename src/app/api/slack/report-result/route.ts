import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { advanceMatch } from "@/lib/advance-match"

export async function POST(request: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const body = await request.json()
  const { slack_user_id, opponent_name, games, team_id } = body

  const { data: integration } = await supabase
    .from("org_integrations")
    .select("*, organization:organizations(*)")
    .eq("slack_team_id", team_id)
    .single()

  if (!integration?.organization_id) {
    return NextResponse.json({ error: "Organization not found for this Slack workspace" }, { status: 404 })
  }

  const orgId = integration.organization_id

  const { data: reporter } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", `${slack_user_id}@slack.placeholder`)
    .single()

  if (!reporter) {
    return NextResponse.json({ error: "Reporter not found" }, { status: 404 })
  }

  const { data: opponent } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", `%${opponent_name}%`)
    .single()

  if (!opponent) {
    return NextResponse.json({ error: "Opponent not found" }, { status: 404 })
  }

  // Find the scheduled bracket match between these two players
  const { data: bracketMatch } = await adminClient
    .from("bracket_matches")
    .select("id, tournament_category_id, player_a_id, player_b_id")
    .eq("status", "scheduled")
    .eq("organization_id", orgId)
    .or(`player_a_id.eq.${reporter.id},player_b_id.eq.${reporter.id}`)
    .or(`player_a_id.eq.${opponent.id},player_b_id.eq.${opponent.id}`)
    .single()

  if (!bracketMatch) {
    return NextResponse.json({ error: "No scheduled match found between these players" }, { status: 404 })
  }

  // Determine winner from games
  const gameWins = { a: 0, b: 0 }
  for (const game of games) {
    if (game.score_a > game.score_b) gameWins.a++
    else if (game.score_b > game.score_a) gameWins.b++
  }

  const winnerId = gameWins.a > gameWins.b ? reporter.id : opponent.id
  const loserId = winnerId === reporter.id ? opponent.id : reporter.id

  // Use shared advanceMatch — goes to pending approval via the same path
  const result = await advanceMatch({
    bracketMatchId: bracketMatch.id,
    winnerId,
    loserId,
    games: games || [],
    reportedVia: "slack",
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, match_id: bracketMatch.id })
}
