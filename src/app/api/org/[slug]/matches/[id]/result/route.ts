import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { advanceMatch } from "@/lib/advance-match"

export async function POST(request: Request, { params: _params }: { params: Promise<{ slug: string; id: string }> }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { games, winner_id, loser_id, bracket_match_id } = body

  if (!bracket_match_id) {
    return NextResponse.json({ error: "bracket_match_id is required" }, { status: 400 })
  }

  const result = await advanceMatch({
    bracketMatchId: bracket_match_id,
    winnerId: winner_id,
    loserId: loser_id || (body.opponent_id),
    games: games || [],
    reportedVia: body.reported_via || "manager",
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
