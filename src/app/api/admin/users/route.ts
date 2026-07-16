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
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false })
  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, platform_role, full_name } = body

  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (platform_role) {
    if (!["admin", "manager", "player"].includes(platform_role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }
    updates.platform_role = platform_role
  }
  if (full_name !== undefined) updates.full_name = full_name

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from("profiles")
    .update(updates)
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

  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 })

  if (id === user.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 })
  }

  const adminClient = createAdminClient()

  await adminClient.from("rankings").delete().eq("entity_id", id)
  await adminClient.from("tournament_entries").delete().eq("profile_id", id)
  await adminClient.from("org_members").delete().eq("profile_id", id)
  await adminClient.from("profiles").delete().eq("id", id)

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
