import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyTournamentPublished } from "@/apps/slack/notifications/tournament"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const { description } = await request.json().catch(() => ({}))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

  const { data: tournament } = await adminClient
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", org.id)
    .single()

  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 })

  if (tournament.status !== "published") {
    return NextResponse.json(
      { error: "Tournament is not published yet" },
      { status: 400 },
    )
  }

  const { data: tournamentCategories } = await adminClient
    .from("tournament_categories")
    .select("category:categories(id, name, is_doubles, organization_id)")
    .eq("tournament_id", id)

  const categories = (tournamentCategories || [])
    .map((tc) => (tc as Record<string, unknown>).category)
    .filter(Boolean) as { id: string; name: string; is_doubles: boolean; organization_id: string }[]

  try {
    const result = await notifyTournamentPublished(org.id, slug, tournament, categories, description)
    if (result.ok && result.ts) {
      await adminClient
        .from("tournaments")
        .update({ slack_notification_ts: result.ts })
        .eq("id", id)
    }
  } catch (err) {
    console.error("[Notify Published] Failed to send notification:", err)
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
