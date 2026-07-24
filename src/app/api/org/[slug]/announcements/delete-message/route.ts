import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deleteMessage, isChannelAllowed } from "@/apps/slack/client"

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
  const { channelId, messageTs } = body

  if (!channelId || !messageTs) {
    return NextResponse.json(
      { error: "Missing required fields: channelId, messageTs" },
      { status: 400 },
    )
  }

  const channelAllowed = await isChannelAllowed(org.id, channelId)
  if (!channelAllowed) {
    return NextResponse.json(
      { error: "Channel is not in the allowed channels list" },
      { status: 400 },
    )
  }

  try {
    const result = await deleteMessage(org.id, channelId, messageTs)
    if (!result) {
      return NextResponse.json(
        { error: "Failed to delete message from Slack" },
        { status: 500 },
      )
    }
  } catch (err) {
    console.error("[Delete Message] Failed to delete message:", err)
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
