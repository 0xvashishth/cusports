import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (profile?.platform_role !== "admin") return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (profile?.platform_role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data } = await supabase.from("organizations").select("*")
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (profile?.platform_role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { name, slug, managerEmail, managerName, managerPassword } = body

  const adminClient = createAdminClient()

  const { data: org, error: orgError } = await adminClient
    .from("organizations")
    .insert({ name, slug, theme: {}, ranking_model: "elo", ranking_config: {}, created_by: user.id })
    .select()
    .single()

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 })

  const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
    email: managerEmail,
    password: managerPassword,
    email_confirm: true,
  })
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  if (!authUser?.user) {
    return NextResponse.json({ error: "Auth user was not created (unexpected response)" }, { status: 500 })
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: authUser.user.id,
    full_name: managerName,
    email: managerEmail,
    platform_role: "manager",
  })
  if (profileError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 400 })
  }

  const { error: memberError } = await adminClient.from("org_members").insert({
    organization_id: org.id,
    profile_id: authUser.user.id,
    org_role: "manager",
    status: "active",
  })
  if (memberError) {
    await adminClient.from("profiles").delete().eq("id", authUser.user.id)
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: `Org member creation failed: ${memberError.message}` }, { status: 400 })
  }

  const { data: verifyMember, error: verifyError } = await adminClient
    .from("org_members")
    .select("id, organization_id, profile_id")
    .eq("profile_id", authUser.user.id)
    .single()

  if (verifyError || !verifyMember) {
    return NextResponse.json({ error: `Org member verification failed after insert` }, { status: 500 })
  }

  return NextResponse.json({
    ...org,
    manager_id: authUser.user.id,
    manager_email: managerEmail,
  })
}

export async function PATCH(request: Request) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: "Missing organization id" }, { status: 400 })

  const allowed = ["name", "slug", "is_active", "theme", "ranking_model", "ranking_config", "logo_url", "banner_url"]
  const sanitized: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in updates) sanitized[key] = updates[key]
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from("organizations")
    .update(sanitized)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) return NextResponse.json({ error: "Missing organization id" }, { status: 400 })

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from("organizations")
    .delete()
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
