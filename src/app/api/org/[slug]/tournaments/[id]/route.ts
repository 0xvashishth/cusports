import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyTournamentPublished, notifyTournamentCompleted, type CategoryWinner } from "@/apps/slack/notifications/tournament"

async function fetchCategoryWinners(
  ac: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<CategoryWinner[]> {
  const { data: tcs } = await ac
    .from("tournament_categories")
    .select("id, category:categories(name)")
    .eq("tournament_id", tournamentId)

  if (!tcs) return []

  const winners: CategoryWinner[] = []

  for (const tc of tcs) {
    const tcData = tc as Record<string, unknown>
    const categoryName = ((tcData.category as Record<string, unknown>)?.name as string) || "Unknown"
    const tcId = tcData.id as string

    const { data: finalMatch } = await ac
      .from("bracket_matches")
      .select("winner_id, player_a_id, player_b_id")
      .eq("tournament_category_id", tcId)
      .in("status", ["completed", "walkover"])
      .is("winner_next_match_id", null)
      .maybeSingle()

    if (!finalMatch?.winner_id) {
      winners.push({ categoryName, winnerName: "TBD", runnerUpName: null, thirdPlaceName: null })
      continue
    }

    const { data: winnerProfile } = await ac
      .from("profiles")
      .select("full_name")
      .eq("id", finalMatch.winner_id)
      .single()

    const winnerName = winnerProfile?.full_name || "Unknown"

    const loserId = finalMatch.winner_id === finalMatch.player_a_id
      ? finalMatch.player_b_id
      : finalMatch.player_a_id

    let runnerUpName: string | null = null
    if (loserId) {
      const { data: runnerUpProfile } = await ac
        .from("profiles")
        .select("full_name")
        .eq("id", loserId)
        .single()
      runnerUpName = runnerUpProfile?.full_name || null
    }

    let thirdPlaceName: string | null = null
    const { data: thirdPlaceMatch } = await ac
      .from("bracket_matches")
      .select("winner_id")
      .eq("tournament_category_id", tcId)
      .eq("bracket_side", "third_place")
      .in("status", ["completed", "walkover"])
      .maybeSingle()

    if (thirdPlaceMatch?.winner_id) {
      const { data: thirdProfile } = await ac
        .from("profiles")
        .select("full_name")
        .eq("id", thirdPlaceMatch.winner_id)
        .single()
      thirdPlaceName = thirdProfile?.full_name || null
    }

    winners.push({ categoryName, winnerName, runnerUpName, thirdPlaceName })
  }

  return winners
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  console.log("[Tournament PATCH] Request received:", { slug, id })

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
  console.log("[Tournament PATCH] Update body:", body)

  const isPublishing = body.status === "published"
  const isCompleting = body.status === "completed"

  const { error: updateError } = await adminClient
    .from("tournaments")
    .update(body)
    .eq("id", id)
    .eq("organization_id", org.id)

  if (updateError) {
    console.log("[Tournament PATCH] Update error:", updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log("[Tournament PATCH] Tournament updated successfully")

  if (isPublishing) {
    console.log("[Tournament PATCH] Tournament published, fetching details for Slack notification")
    const { data: tournament } = await adminClient
      .from("tournaments")
      .select("*")
      .eq("id", id)
      .single()

    const { data: tournamentCategories } = await adminClient
      .from("tournament_categories")
      .select("category:categories(id, name, is_doubles, organization_id)")
      .eq("tournament_id", id)

    const categories = (tournamentCategories || [])
      .map((tc) => (tc as Record<string, unknown>).category)
      .filter(Boolean) as { id: string; name: string; is_doubles: boolean; organization_id: string }[]

    if (tournament) {
      console.log("[Tournament PATCH] Sending publish notification for:", tournament.name)
      notifyTournamentPublished(org.id, slug, tournament, categories).catch((err) => {
        console.error("[Tournament PATCH] Failed to send publish notification:", err)
      })
    }
  }

  if (isCompleting) {
    console.log("[Tournament PATCH] Tournament completed, fetching winners for Slack notification")
    const { data: tournament } = await adminClient
      .from("tournaments")
      .select("*")
      .eq("id", id)
      .single()

    if (tournament) {
      const winners = await fetchCategoryWinners(adminClient, id)
      console.log("[Tournament PATCH] Winners fetched:", winners)
      notifyTournamentCompleted(org.id, slug, tournament, winners).catch((err) => {
        console.error("[Tournament PATCH] Failed to send completion notification:", err)
      })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
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

  const { error: delError } = await adminClient
    .from("tournaments")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id)

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
