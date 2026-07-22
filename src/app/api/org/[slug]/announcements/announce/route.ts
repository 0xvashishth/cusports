import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { postAnnouncementToSlack } from "@/apps/slack/notifications/announcement"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

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

  const body = await request.json()
  const { channelId, title, announcementBody, linkUrl } = body

  if (!channelId || !title || !announcementBody) {
    return NextResponse.json(
      { error: "Missing required fields: channelId, title, announcementBody" },
      { status: 400 },
    )
  }

  try {
    const result = await postAnnouncementToSlack(org.id, channelId, title, announcementBody, linkUrl)
    if (!result) {
      return NextResponse.json(
        { error: "Failed to post announcement to Slack" },
        { status: 500 },
      )
    }
  } catch (err) {
    console.error("[Announce] Failed to post announcement:", err)
    return NextResponse.json({ error: "Failed to post announcement" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
