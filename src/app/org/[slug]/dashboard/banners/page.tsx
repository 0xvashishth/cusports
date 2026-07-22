import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DashboardLayout } from "@/components/dashboard-layout"
import { BannersClient } from "./banners-client"
import { AnnouncementsClient } from "./announcements-client"
import { Separator } from "@/components/ui/separator"

export default async function BannersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: announcements } = await admin
    .from("announcements")
    .select("*")
    .eq("organization_id", org.id)
    .order("starts_at", { ascending: false })

  const { data: integration } = await admin
    .from("org_integrations")
    .select("allowed_channel_ids")
    .eq("organization_id", org.id)
    .single()

  const { data: { user } } = await supabase.auth.getUser()

  const allowedChannelIds = integration?.allowed_channel_ids || []

  return (
    <DashboardLayout organization={org}>
      <div className="space-y-12">
        <BannersClient
          org={org}
          announcements={announcements || []}
          userId={user?.id || ""}
        />
        <Separator />
        <AnnouncementsClient
          org={org}
          allowedChannelIds={allowedChannelIds}
        />
      </div>
    </DashboardLayout>
  )
}
