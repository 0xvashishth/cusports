"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Lock } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("platform_role")
          .eq("id", user.id)
          .single()

        if (profile?.platform_role === "admin") {
          router.push("/admin/organizations")
        } else if (profile?.platform_role === "manager") {
          const res = await fetch("/api/user/org")
          if (res.ok) {
            const { slug } = await res.json()
            if (slug) router.push(`/org/${slug}/dashboard`)
            else router.push("/")
          } else {
            router.push("/")
          }
        } else {
          router.push("/")
        }
      } else {
        setChecking(false)
      }
    }
    checkSession()
  }, [router])

  if (checking) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", data.user.id)
      .single()

    if (profile?.platform_role === "admin") {
      router.push("/admin/organizations")
    } else if (profile?.platform_role === "manager") {
      const res = await fetch("/api/user/org")
      if (res.ok) {
        const { slug } = await res.json()
        if (slug) router.push(`/org/${slug}/dashboard`)
        else router.push("/")
      } else {
        router.push("/")
      }
    } else {
      router.push("/")
    }
    router.refresh()
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Sign in to your Cusports account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <Lock className="inline h-3 w-3 mr-1" />
            Invite-only platform
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
