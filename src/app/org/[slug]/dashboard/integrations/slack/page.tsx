import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard-layout"
import { SlackIntegrationClient } from "./slack-client"

export default async function SlackIntegrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: integration } = await supabase
    .from("org_integrations")
    .select("*")
    .eq("organization_id", org.id)
    .single()

  return (
    <DashboardLayout organization={org}>
      <SlackIntegrationClient org={org} integration={integration} />
    </DashboardLayout>
  )
}
