"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Trophy, Globe } from "lucide-react"
import { formatDate } from "@/lib/utils"

interface AdminTournament {
  id: string
  name: string
  status: string
  start_date: string
  end_date: string
  organization?: { name: string }
}

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<AdminTournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/tournaments")
        const data = await res.json()
        console.log("[admin/tournaments] status:", res.status, "data:", data)
        if (res.ok && Array.isArray(data)) {
          setTournaments(data)
        }
      } catch (e) {
        console.error("[admin/tournaments] fetch error:", e)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">All Tournaments</h1>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">All Tournaments</h1>
          <p className="text-muted-foreground">Tournaments across all organizations</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Trophy className="h-4 w-4 mr-2" />
          {tournaments.length} total
        </Badge>
      </div>

      {tournaments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No tournaments yet</p>
            <p className="text-sm text-muted-foreground">Tournaments will appear here once created by managers.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <Card key={t.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span>{t.organization?.name}</span>
                    <span className="text-muted-foreground/50">|</span>
                    <span>{formatDate(t.start_date)} - {formatDate(t.end_date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status === "published" ? "success" : t.status === "completed" ? "secondary" : "warning"}>
                    {t.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
