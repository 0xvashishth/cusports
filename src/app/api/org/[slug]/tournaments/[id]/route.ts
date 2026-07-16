import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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
