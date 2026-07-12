import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const adminClient = createAdminClient()

  const { data: org } = await adminClient
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single()

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get("tournamentId")

  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 })
  }

  // Get tournament categories for this tournament
  const { data: tcs } = await adminClient
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", tournamentId)

  if (!tcs || tcs.length === 0) {
    return NextResponse.json([])
  }

  const tcIds = tcs.map((tc: { id: string }) => tc.id)

  const { data: configs } = await adminClient
    .from("fixtures_config")
    .select("*")
    .in("tournament_category_id", tcIds)

  return NextResponse.json(configs || [])
}
