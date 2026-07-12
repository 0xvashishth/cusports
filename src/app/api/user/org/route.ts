import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ slug: null })

  const adminClient = createAdminClient()

  const { data: membership } = await adminClient
    .from("org_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ slug: null })

  const { data: org } = await adminClient
    .from("organizations")
    .select("slug")
    .eq("id", membership.organization_id)
    .single()

  return NextResponse.json({ slug: org?.slug ?? null })
}
