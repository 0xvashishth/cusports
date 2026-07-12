"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { BotMessageSquare, Plug, PlugZap, Unplug, ListChecks, BookOpen, X } from "lucide-react"
import type { Organization, OrgIntegration } from "@/lib/types"

interface SlackIntegrationClientProps {
  org: Organization
  integration: OrgIntegration | null
}

export function SlackIntegrationClient({ org, integration }: SlackIntegrationClientProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [form, setForm] = useState({
    slackTeamId: integration?.slack_team_id || "",
    slackChannelId: integration?.slack_channel_id || "",
    slackBotToken: "",
    allowedChannelIds: integration?.allowed_channel_ids || [],
  })
  const [newChannelId, setNewChannelId] = useState("")

  async function saveIntegration() {
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    const payload: Record<string, unknown> = {
      organization_id: org.id,
      slack_team_id: form.slackTeamId,
      slack_channel_id: form.slackChannelId,
      allowed_channel_ids: form.allowedChannelIds.length > 0 ? form.allowedChannelIds : null,
    }

    if (form.slackBotToken) {
      payload.slack_bot_token_encrypted = btoa(form.slackBotToken)
    }

    if (integration) {
      const { error } = await supabase
        .from("org_integrations")
        .update(payload)
        .eq("id", integration.id)
      if (error) {
        setMessage({ type: "error", text: "Error saving integration: " + error.message })
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from("org_integrations")
        .insert(payload)
      if (error) {
        setMessage({ type: "error", text: "Error saving integration: " + error.message })
        setSaving(false)
        return
      }
    }

    setMessage({ type: "success", text: "Slack integration saved!" })
    setSaving(false)
    router.refresh()
  }

  async function disconnectSlack() {
    if (!integration) return
    setSaving(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.from("org_integrations").delete().eq("id", integration.id)
    if (error) {
      setMessage({ type: "error", text: "Error disconnecting: " + error.message })
    } else {
      setMessage({ type: "success", text: "Slack integration disconnected" })
      setForm({ slackTeamId: "", slackChannelId: "", slackBotToken: "", allowedChannelIds: [] })
    }
    setSaving(false)
    router.refresh()
  }

  const isConnected = !!integration?.slack_team_id

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Slack Integration</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Slack workspace to enable match reporting
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BotMessageSquare className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Connection</CardTitle>
            </div>
            {isConnected ? (
              <Badge variant="success" className="gap-1">
                <PlugZap className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Plug className="h-3 w-3" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-id">Slack Team / Workspace ID</Label>
            <Input
              id="team-id"
              value={form.slackTeamId}
              onChange={(e) => setForm({ ...form, slackTeamId: e.target.value })}
              placeholder="T00000000"
            />
            <p className="text-xs text-muted-foreground">
              Right-click your workspace name {"->"} Copy link, or find at slack.com/apps/manage
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="channel-id">Slack Channel ID</Label>
            <Input
              id="channel-id"
              value={form.slackChannelId}
              onChange={(e) => setForm({ ...form, slackChannelId: e.target.value })}
              placeholder="C00000000"
            />
            <p className="text-xs text-muted-foreground">
              Right-click a channel {"->"} Copy link. The ID is after the last slash (e.g. C0123ABCDEF)
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot User OAuth Token</Label>
            <Input
              id="bot-token"
              type="password"
              value={form.slackBotToken}
              onChange={(e) => setForm({ ...form, slackBotToken: e.target.value })}
              placeholder="xoxb-..."
            />
            <p className="text-xs text-muted-foreground">
              From your Slack App {"->"} OAuth & Permissions. Starts with xoxb-
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveIntegration} disabled={saving} className="gap-2">
              {saving ? "Saving..." : integration ? "Update Connection" : "Connect"}
            </Button>
            {integration && (
              <Button variant="destructive" onClick={disconnectSlack} disabled={saving} className="gap-2">
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
          {message && (
            <div
              className={`p-3 rounded-lg border text-sm ${
                message.type === "success"
                  ? "bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Channel Allowlist</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Restrict score reports and announcements to specific channels. If empty, all channels are allowed.
          </p>
          <div className="flex gap-2">
            <Input
              value={newChannelId}
              onChange={(e) => setNewChannelId(e.target.value)}
              placeholder="C00000000"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newChannelId.trim()) {
                  e.preventDefault()
                  if (!form.allowedChannelIds.includes(newChannelId.trim())) {
                    setForm({ ...form, allowedChannelIds: [...form.allowedChannelIds, newChannelId.trim()] })
                  }
                  setNewChannelId("")
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (newChannelId.trim() && !form.allowedChannelIds.includes(newChannelId.trim())) {
                  setForm({ ...form, allowedChannelIds: [...form.allowedChannelIds, newChannelId.trim()] })
                  setNewChannelId("")
                }
              }}
              disabled={!newChannelId.trim()}
            >
              Add
            </Button>
          </div>
          {form.allowedChannelIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.allowedChannelIds.map((channelId) => (
                <Badge key={channelId} variant="secondary" className="gap-1 pr-1">
                  {channelId}
                  <button
                    type="button"
                    className="ml-1 rounded-full p-0.5 hover:bg-muted"
                    onClick={() => {
                      setForm({
                        ...form,
                        allowedChannelIds: form.allowedChannelIds.filter((id) => id !== channelId),
                      })
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Setup Instructions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          {[
            {
              step: 1,
              title: "Create a Slack App",
              content: (
                <p>
                  Go to{" "}
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    api.slack.com/apps
                  </a>{" "}
                  and click <strong>Create New App</strong>. Choose &ldquo;From scratch&rdquo;,
                  name it (e.g. &ldquo;{org.name} TT Bot&rdquo;), and select your workspace.
                </p>
              ),
            },
            {
              step: 2,
              title: "Configure Bot Token Scopes",
              content: (
                <div>
                  <p>Under <strong>OAuth & Permissions</strong>, add these Bot Token Scopes:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">chat:write</code> — Post announcements</li>
                    <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">channels:read</code> — Read channel info</li>
                    <li><code className="bg-muted px-1.5 py-0.5 rounded text-xs">app_mentions:read</code> — Listen for mentions</li>
                  </ul>
                  <p className="mt-2">
                    Click <strong>Install to Workspace</strong> and copy the Bot User OAuth Token.
                  </p>
                </div>
              ),
            },
            {
              step: 3,
              title: "Enable Event Subscriptions",
              content: (
                <div>
                  <p>Under <strong>Event Subscriptions</strong>, toggle ON.</p>
                  <p className="mt-1">Set the Request URL to:</p>
                  <pre className="bg-muted p-2 rounded mt-1 text-xs break-all">
                    {process.env.NEXT_PUBLIC_SITE_URL || "https://your-app.vercel.app"}/api/slack/events
                  </pre>
                  <p className="mt-2">Under <strong>Subscribe to bot events</strong>, add <code className="bg-muted px-1.5 py-0.5 rounded text-xs">app_mention</code>.</p>
                </div>
              ),
            },
            {
              step: 4,
              title: "Invite Bot to Channel",
              content: (
                <p>
                  Invite the bot with <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/invite @{org.name} TT Bot</code>.
                </p>
              ),
            },
            {
              step: 5,
              title: "Copy Channel ID",
              content: (
                <p>
                  Right-click your channel {"->"} <strong>Copy link</strong>. The ID is the part after the last <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/</code>.
                </p>
              ),
            },
          ].map(({ step, title, content }) => (
            <div key={step}>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {step}
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-semibold text-foreground">{title}</h4>
                  <div className="text-muted-foreground leading-relaxed">{content}</div>
                </div>
              </div>
              {step < 5 && <Separator className="mt-4" />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Usage</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-foreground mb-1">Report a Match Result</h4>
              <p className="text-muted-foreground mb-2">Mention the bot with scores:</p>
              <pre className="bg-background border p-3 rounded text-xs overflow-x-auto">
                @{org.name} TT Bot report match vs @OpponentName 11-7, 9-11, 11-5
              </pre>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-1">Check Rankings</h4>
              <pre className="bg-background border p-3 rounded text-xs overflow-x-auto">
                @{org.name} TT Bot rankings
              </pre>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold text-foreground mb-1">Upcoming Fixtures</h4>
              <pre className="bg-background border p-3 rounded text-xs overflow-x-auto">
                @{org.name} TT Bot fixtures
              </pre>
            </div>
          </div>
          <div className="text-muted-foreground space-y-1">
            <p>Reported results go through pending approval by default.</p>
            <p>The opponent must be registered in the system.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
