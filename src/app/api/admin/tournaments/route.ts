import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) {
    console.error("[api/admin/tournaments] No user:", authError?.message)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = createAdminClient()

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.error("[api/admin/tournaments] Profile error:", profileError.message)
  }

  if (profile?.platform_role !== "admin") {
    console.error("[api/admin/tournaments] Not admin, role:", profile?.platform_role)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: tournaments, error: tError } = await adminClient
    .from("tournaments")
    .select("*")

  if (tError) {
    console.error("[api/admin/tournaments] Tournaments error:", tError.message)
    return NextResponse.json({ error: tError.message }, { status: 500 })
  }

  const { data: orgs } = await adminClient
    .from("organizations")
    .select("id, name, slug")

  const orgMap = new Map<string, { name: string; slug: string }>()
  if (orgs) {
    for (const org of orgs) {
      orgMap.set(org.id, { name: org.name, slug: org.slug })
    }
  }

  const result = (tournaments || []).map((t) => ({
    ...t,
    organization: orgMap.get(t.organization_id) || null,
  }))

  console.log("[api/admin/tournaments] Returning", result.length, "tournaments")

  return NextResponse.json(result)
}
