import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard-layout"
import { MatchResultClient } from "./match-result-client"

export default async function MatchResultPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const supabase = await createClient()

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).single()
  if (!org) notFound()

  const { data: match } = await supabase
    .from("matches")
    .select("*, tournament:tournaments(*), category:categories(*), player_a:profiles!player_a_id(*), player_b:profiles!player_b_id(*), games:match_games(*)")
    .eq("id", id)
    .single()

  if (!match) notFound()

  return (
    <DashboardLayout organization={org}>
      <MatchResultClient org={org} match={match} />
    </DashboardLayout>
  )
}
