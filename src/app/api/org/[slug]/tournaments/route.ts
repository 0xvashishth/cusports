import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_CATEGORIES_DATA } from "@/lib/constants"

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
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

  const adminClient = createAdminClient()

  const { data: org } = await adminClient
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single()

  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 })

  const body = await request.json()
  const { name, venue, startDate, endDate, selectedCategories, categoryConfigs } = body

  if (!name || !startDate || !endDate) {
    return NextResponse.json({ error: "name, startDate, and endDate are required" }, { status: 400 })
  }

  if (!selectedCategories || selectedCategories.length === 0) {
    return NextResponse.json({ error: "At least one category is required" }, { status: 400 })
  }

  const { data: tournament, error: insertError } = await adminClient
    .from("tournaments")
    .insert({
      organization_id: org.id,
      name,
      venue: venue || null,
      start_date: startDate,
      end_date: endDate,
      status: "draft",
    })
    .select()
    .single()

  if (insertError || !tournament) {
    return NextResponse.json({ error: insertError?.message || "Failed to create tournament" }, { status: 500 })
  }

  const createdCategories: { id: string; name: string; is_doubles: boolean; organization_id: string }[] = []

  for (const catName of selectedCategories) {
    const catDef = DEFAULT_CATEGORIES_DATA.find((c) => c.name === catName)
    if (!catDef) continue
    const config = categoryConfigs?.[catName] || { points_per_game: 11, games_per_match: 5, win_by_two: true }

    const { data: existing } = await adminClient
      .from("categories")
      .select("id, name, is_doubles, organization_id")
      .eq("organization_id", org.id)
      .eq("name", catName)
      .maybeSingle()

    let categoryId: string

    if (existing) {
      categoryId = existing.id
      createdCategories.push(existing)
    } else {
      const { data: newCat, error: catError } = await adminClient
        .from("categories")
        .insert({ organization_id: org.id, name: catDef.name, is_doubles: catDef.is_doubles })
        .select()
        .single()
      if (catError || !newCat) {
        return NextResponse.json({ error: catError?.message || `Failed to create category "${catName}"` }, { status: 500 })
      }
      categoryId = newCat.id
      createdCategories.push(newCat)
    }

    const { error: tcError } = await adminClient.from("tournament_categories").insert({
      tournament_id: tournament.id,
      category_id: categoryId,
      points_per_game: config.points_per_game,
      games_per_match: config.games_per_match,
      win_by_two: config.win_by_two,
      format_type: "knockout",
    })

    if (tcError) {
      return NextResponse.json({ error: `Failed to link category "${catName}": ${tcError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, tournament })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
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

  const { tournamentId } = await request.json()
  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 })
  }

  const { error: delError } = await adminClient
    .from("tournaments")
    .delete()
    .eq("id", tournamentId)
    .eq("organization_id", org.id)

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
