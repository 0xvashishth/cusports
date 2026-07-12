"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

interface AuthHeaderProps {
  showCta?: boolean
}

export function AuthHeader({ showCta }: AuthHeaderProps) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [orgSlug, setOrgSlug] = useState<string | null>(null)

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: profile } = await supabase
          .from("profiles")
          .select("platform_role")
          .eq("id", user.id)
          .single()
        if (profile) {
          setRole(profile.platform_role)
          if (profile.platform_role === "manager" || profile.platform_role === "player") {
            const res = await fetch("/api/user/org")
            if (res.ok) {
              const data = await res.json()
              if (data.slug) setOrgSlug(data.slug)
            }
          }
        }
      }
      setLoading(false)
    }
    checkUser()
  }, [])

  if (loading) {
    return showCta
      ? <div className="h-12 w-52 bg-muted rounded-md animate-pulse" />
      : <div className="h-9 w-24 bg-muted rounded-md animate-pulse" />
  }

  if (userId) {
    const dashboardHref = role === "admin"
      ? "/admin/organizations"
      : orgSlug
        ? `/org/${orgSlug}/dashboard`
        : null

    if (showCta) {
      return dashboardHref ? (
        <Link href={dashboardHref}>
          <Button size="lg" className="text-lg px-8">
            Go to Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="lg" className="text-lg px-8" disabled>
            No org assigned
          </Button>
        </div>
      )
    }

    return dashboardHref ? (
      <Link href={dashboardHref}>
        <Button>Dashboard</Button>
      </Link>
    ) : (
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">role={role} slug={orgSlug}</span>
        <Button disabled>No org assigned</Button>
      </div>
    )
  }

  if (showCta) {
    return (
      <Link href="/auth/login">
        <Button size="lg" className="text-lg px-8">
          Sign In to Dashboard
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </Link>
    )
  }

  return (
    <Link href="/auth/login">
      <Button variant="ghost">Sign In</Button>
    </Link>
  )
}
