import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { advanceMatch, walkoverMatch } from "@/lib/advance-match"

export async function POST(request: Request, { params: _params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.platform_role !== "manager" && profile.platform_role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { bracketMatchId, winnerId, loserId, games, isWalkover } = body

  if (!bracketMatchId || !winnerId) {
    return NextResponse.json({ error: "bracketMatchId and winnerId are required" }, { status: 400 })
  }

  let result
  if (isWalkover) {
    result = await walkoverMatch(bracketMatchId, winnerId)
  } else {
    if (!loserId) {
      return NextResponse.json({ error: "loserId is required for non-walkover results" }, { status: 400 })
    }
    result = await advanceMatch({
      bracketMatchId,
      winnerId,
      loserId,
      games: games || [],
      reportedBy: "manager",
    })
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
