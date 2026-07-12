import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_CATEGORIES_DATA } from "@/lib/constants"

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
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

  const body = await request.json()
  const { email, fullName, rating: initialRating, category_ids } = body

  if (!email || !fullName) {
    return NextResponse.json({ error: "Email and full name are required" }, { status: 400 })
  }

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single()

  let profileId: string

  if (existingProfile) {
    profileId = existingProfile.id
  } else {
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(2),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (authError || !authData?.user) {
      return NextResponse.json({ error: authError?.message || "Failed to create user" }, { status: 400 })
    }
    profileId = authData.user.id

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: profileId,
      full_name: fullName,
      email,
      platform_role: "player",
    })
    if (profileError) {
      await adminClient.auth.admin.deleteUser(profileId)
      return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 400 })
    }
  }

  const { error: memberError } = await adminClient.from("org_members").insert({
    organization_id: org.id,
    profile_id: profileId,
    org_role: "player",
    status: "active",
  })
  if (memberError) {
    return NextResponse.json({ error: `Member creation failed: ${memberError.message}` }, { status: 400 })
  }

  let { data: categories } = await adminClient
    .from("categories")
    .select("id, name")
    .eq("organization_id", org.id)

  if (!categories || categories.length === 0) {
    const { data: inserted } = await adminClient
      .from("categories")
      .insert(DEFAULT_CATEGORIES_DATA.map((c) => ({ organization_id: org.id, name: c.name, is_doubles: c.is_doubles })))
      .select("id, name")
    categories = inserted || []
  }

  if (initialRating !== null) {
    const rating = initialRating || 1000
    const targetCategories = category_ids
      ? categories.filter((c) => category_ids.includes(c.id))
      : categories
    for (const cat of targetCategories) {
      await adminClient.from("rankings").insert({
        organization_id: org.id,
        category_id: cat.id,
        entity_id: profileId,
        entity_type: "player",
        rating,
        points: 0,
        matches_played: 0,
        wins: 0,
        losses: 0,
      })
    }
  }

  return NextResponse.json({ success: true, profileId })
}
