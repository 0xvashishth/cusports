import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const adminClient = createAdminClient()

  const { data: org } = await adminClient.from("organizations").select("id").eq("slug", slug).single()
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: entries } = await adminClient
    .from("tournament_entries")
    .select("*, profile:profiles(*)")
    .eq("tournament_id", id)

  return NextResponse.json(entries || [])
}

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

  const { data: tournament } = await adminClient
    .from("tournaments")
    .select("status")
    .eq("id", id)
    .eq("organization_id", org.id)
    .single()

  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 })

  if (tournament.status !== "published") {
    return NextResponse.json({ error: "Players can only be added to published tournaments" }, { status: 400 })
  }

  const body = await request.json()
  const { profileIds, categoryId } = body

  if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
    return NextResponse.json({ error: "profileIds array is required" }, { status: 400 })
  }

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 })
  }

  const entries = profileIds.map((pid: string) => ({
    tournament_id: id,
    profile_id: pid,
    category_id: categoryId,
  }))

  const { error: insertError } = await adminClient
    .from("tournament_entries")
    .insert(entries)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
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

  const { data: tournament } = await adminClient
    .from("tournaments")
    .select("status")
    .eq("id", id)
    .eq("organization_id", org.id)
    .single()

  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 })

  if (tournament.status !== "published") {
    return NextResponse.json({ error: "Players can only be removed from published tournaments" }, { status: 400 })
  }

  const body = await request.json()
  const { entryId, profileId, categoryId } = body

  let query = adminClient.from("tournament_entries").delete().eq("tournament_id", id)

  if (entryId) query = query.eq("id", entryId)
  if (profileId) query = query.eq("profile_id", profileId)
  if (categoryId) query = query.eq("category_id", categoryId)

  const { error: delError } = await query

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
