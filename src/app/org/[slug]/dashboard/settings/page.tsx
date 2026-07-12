import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard-layout"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  return (
    <DashboardLayout organization={org}>
      <SettingsClient org={org} />
    </DashboardLayout>
  )
}
