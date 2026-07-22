"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Send, Hash, CheckCircle, AlertCircle } from "lucide-react"
import type { Organization } from "@/lib/types"

interface AnnouncementsClientProps {
  org: Organization
  allowedChannelIds: string[]
}

export function AnnouncementsClient({ org, allowedChannelIds }: AnnouncementsClientProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: "",
    body: "",
    linkUrl: "",
    channelId: allowedChannelIds[0] || "",
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function resetForm() {
    setForm({ title: "", body: "", linkUrl: "", channelId: allowedChannelIds[0] || "" })
    setError(null)
    setSuccess(false)
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function sendAnnouncement() {
    if (!form.channelId || !form.body) {
      setError("Please fill in all required fields")
      return
    }

    setSending(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch(`/api/org/${org.slug}/announcements/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: form.channelId,
          title: form.title,
          announcementBody: form.body,
          linkUrl: form.linkUrl || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send announcement")
        setSending(false)
        return
      }

      setSuccess(true)
      setSending(false)
      setTimeout(() => {
        setOpen(false)
        resetForm()
      }, 1500)
    } catch {
      setError("Failed to send announcement")
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Slack Announcements</h2>
          <p className="text-muted-foreground mt-1">Send announcements to Slack channels</p>
        </div>
        <Button className="gap-2" onClick={openCreate} disabled={allowedChannelIds.length === 0}>
          <Send className="h-4 w-4" />
          Send Announcement
        </Button>
      </div>

      {/* Send Announcement Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Announcement to Slack</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="slackChannel">Channel</Label>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <select
                  id="slackChannel"
                  value={form.channelId}
                  onChange={(e) => setForm({ ...form, channelId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {allowedChannelIds.map((channelId) => (
                    <option key={channelId} value={channelId}>
                      {channelId}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Select a channel from your allowed channels list.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcementTitle">Title (optional)</Label>
              <Input
                id="announcementTitle"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Tournament Registration Open"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to post a message without a title.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcementBody">Message</Label>
              <textarea
                id="announcementBody"
                className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write your announcement here...&#10;&#10;Supports Slack formatting:&#10;*bold* _italic_ ~strikethrough~&#10;`code` ```code block```&#10;> quote&#10;• bullet points"
              />
              <p className="text-xs text-muted-foreground">
                Supports Slack formatting: <code className="bg-muted px-1 rounded">*bold*</code> <code className="bg-muted px-1 rounded">_italic_</code> <code className="bg-muted px-1 rounded">~strikethrough~</code> <code className="bg-muted px-1 rounded">`code`</code> <code className="bg-muted px-1 rounded">&gt; quote</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcementLink">Link URL (optional)</Label>
              <Input
                id="announcementLink"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="https://example.com/details"
              />
              <p className="text-xs text-muted-foreground">
                Adds a &quot;Learn More&quot; button to the announcement.
              </p>
            </div>

            <Separator />

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/50 rounded-md p-2">
                <CheckCircle className="h-4 w-4" />
                Announcement sent successfully!
              </div>
            )}

            <Button onClick={sendAnnouncement} disabled={sending || success} className="w-full gap-2">
              {sending ? "Sending..." : success ? "Sent!" : "Send Announcement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {allowedChannelIds.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Send className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-lg font-medium">No Slack channels configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add allowed channels in{" "}
              <a href={`/org/${org.slug}/dashboard/integrations/slack`} className="text-primary hover:underline">
                Integrations
              </a>{" "}
              to enable Slack announcements.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send a quick announcement to any of your {allowedChannelIds.length} configured channel{allowedChannelIds.length !== 1 ? "s" : ""}.
            </p>
            <div className="flex flex-wrap gap-2">
              {allowedChannelIds.map((channelId) => (
                <Button
                  key={channelId}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setForm({ ...form, channelId })
                    setOpen(true)
                  }}
                >
                  <Hash className="h-3 w-3" />
                  {channelId}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
