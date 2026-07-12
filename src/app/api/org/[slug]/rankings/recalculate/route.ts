import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { recalculateCategory } from "@/lib/rankings"
import { DEFAULT_ELO_CONFIG } from "@/lib/elo"
import type { EloConfig } from "@/lib/elo"

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const { matchId, mode } = body

  const cfg: EloConfig = {
    ...DEFAULT_ELO_CONFIG,
    ...((org.ranking_config as Record<string, unknown>) || {}),
  }

  if (mode === "all") {
    // Recalculate rankings for ALL categories in this org
    const { data: categories } = await supabase
      .from("categories")
      .select("id")
      .eq("organization_id", org.id)

    if (!categories || categories.length === 0) {
      return NextResponse.json({ success: true, rankingsUpdated: 0 })
    }

    let totalUpdated = 0
    for (const cat of categories) {
      const result = await recalculateCategory(org.id, cat.id, cfg)
      totalUpdated += result.updated
    }

    return NextResponse.json({
      success: true,
      rankingsUpdated: totalUpdated,
    })
  }

  // Single match recalculation
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 })

  const { data: bracketMatch } = await supabase
    .from("bracket_matches")
    .select("tournament_category_id")
    .eq("id", matchId)
    .single()

  if (!bracketMatch) return NextResponse.json({ error: "Match not found" }, { status: 400 })

  // Look up category from tournament_category
  const { data: tc } = await supabase
    .from("tournament_categories")
    .select("category_id")
    .eq("id", bracketMatch.tournament_category_id)
    .single()

  if (!tc?.category_id) {
    return NextResponse.json({ error: "Match has no category" }, { status: 400 })
  }

  // Recalculate the entire category to correctly handle both new and edited matches
  const result = await recalculateCategory(org.id, tc.category_id, cfg)

  return NextResponse.json({
    success: true,
    rankingsUpdated: result.updated,
    categoryId: tc.category_id,
  })
}
