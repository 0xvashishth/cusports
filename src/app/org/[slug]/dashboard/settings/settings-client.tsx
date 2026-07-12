"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Palette, Settings2, Save } from "lucide-react"
import type { Organization, RankingModel } from "@/lib/types"

interface SettingsClientProps {
  org: Organization
}

export function SettingsClient({ org }: SettingsClientProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState({
    primaryColor: (org.theme as Record<string, string>)?.primaryColor || "#1d4ed8",
    logoUrl: org.logo_url || "",
    bannerUrl: org.banner_url || "",
  })
  const [rankingModel, setRankingModel] = useState<RankingModel>(org.ranking_model)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  async function saveSettings() {
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    const { error } = await supabase
      .from("organizations")
      .update({
        theme: { primaryColor: theme.primaryColor },
        logo_url: theme.logoUrl || null,
        banner_url: theme.bannerUrl || null,
        ranking_model: rankingModel,
      })
      .eq("id", org.id)

    if (error) {
      setMessage({ type: "error", text: "Error saving settings: " + error.message })
    } else {
      setMessage({ type: "success", text: "Settings saved successfully!" })
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your organization configuration</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Theme & Branding</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="primary-color">Primary Color</Label>
            <div className="flex gap-2">
              <Input
                id="primary-color"
                type="color"
                value={theme.primaryColor}
                onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                className="w-16 h-10 p-1 cursor-pointer"
              />
              <Input
                value={theme.primaryColor}
                onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                placeholder="#1d4ed8"
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              value={theme.logoUrl}
              onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="banner-url">Banner URL</Label>
            <Input
              id="banner-url"
              value={theme.bannerUrl}
              onChange={(e) => setTheme({ ...theme, bannerUrl: e.target.value })}
              placeholder="https://example.com/banner.png"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Ranking Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ranking-model">Ranking Model</Label>
            <Select value={rankingModel} onValueChange={(v: RankingModel) => setRankingModel(v)}>
              <SelectTrigger id="ranking-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="elo">ELO Rating</SelectItem>
                <SelectItem value="points">Points / Tier-based</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              {rankingModel === "elo"
                ? "ELO: Rating changes after each match based on opponent strength. Standard logistic Elo expectation formula with configurable K-factor."
                : "Points: Points awarded per tournament round. Best N results count in a rolling window."}
            </p>
          </div>
        </CardContent>
      </Card>

      {message && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <Button onClick={saveSettings} disabled={saving} size="lg" className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  )
}
