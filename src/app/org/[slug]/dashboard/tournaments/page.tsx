import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard-layout"
import { TournamentsClient } from "./tournaments-client"

export default async function TournamentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .eq("organization_id", org.id)
    .order("start_date", { ascending: false })

  return (
    <DashboardLayout organization={org}>
      <TournamentsClient
        org={org}
        tournaments={tournaments || []}
      />
    </DashboardLayout>
  )
}
