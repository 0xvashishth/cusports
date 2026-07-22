"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Megaphone, Plus, ExternalLink, Clock, Pencil, Trash2, Send, Hash } from "lucide-react"
import { formatDate } from "@/lib/utils"
import type { Announcement, Organization } from "@/lib/types"

interface BannersClientProps {
  org: Organization
  announcements: Announcement[]
  userId: string
  allowedChannelIds: string[]
}

export function BannersClient({ org, announcements, userId, allowedChannelIds }: BannersClientProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    title: "",
    body: "",
    linkUrl: "",
    startsAt: "",
    endsAt: "",
    postToSlack: false,
    slackChannelId: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slackPosting, setSlackPosting] = useState(false)
  const [slackError, setSlackError] = useState<string | null>(null)
  const [slackSuccess, setSlackSuccess] = useState(false)

  function resetForm() {
    setForm({ title: "", body: "", linkUrl: "", startsAt: "", endsAt: "", postToSlack: false, slackChannelId: "" })
    setError(null)
    setSlackError(null)
    setSlackSuccess(false)
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setOpen(true)
  }

  function openEdit(a: Announcement) {
    setEditing(a)
    setForm({
      title: a.title,
      body: a.body,
      linkUrl: a.link_url || "",
      startsAt: a.starts_at.slice(0, 16),
      endsAt: a.ends_at.slice(0, 16),
      postToSlack: false,
      slackChannelId: "",
    })
    setError(null)
    setSlackError(null)
    setSlackSuccess(false)
    setOpen(true)
  }

  async function postToSlack(channelId: string, title: string, body: string, linkUrl?: string) {
    setSlackPosting(true)
    setSlackError(null)
    setSlackSuccess(false)

    try {
      const res = await fetch(`/api/org/${org.slug}/announcements/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, title, announcementBody: body, linkUrl }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSlackError(data.error || "Failed to post to Slack")
        setSlackPosting(false)
        return false
      }

      setSlackSuccess(true)
      setSlackPosting(false)
      return true
    } catch {
      setSlackError("Failed to post to Slack")
      setSlackPosting(false)
      return false
    }
  }

  async function saveAnnouncement() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    if (editing) {
      const { error: updateError } = await supabase
        .from("announcements")
        .update({
          title: form.title,
          body: form.body,
          link_url: form.linkUrl || null,
          starts_at: form.startsAt,
          ends_at: form.endsAt,
        })
        .eq("id", editing.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase.from("announcements").insert({
        organization_id: org.id,
        title: form.title,
        body: form.body,
        link_url: form.linkUrl || null,
        starts_at: form.startsAt,
        ends_at: form.endsAt,
        created_by: userId,
      })

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
    }

    if (form.postToSlack && form.slackChannelId) {
      await postToSlack(form.slackChannelId, form.title, form.body, form.linkUrl || undefined)
    }

    setSaving(false)
    setOpen(false)
    setEditing(null)
    resetForm()
    router.refresh()
  }

  async function deleteAnnouncement() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", deleteTarget.id)

    if (error) {
      setError(error.message)
      setDeleting(false)
      return
    }

    setDeleting(false)
    setDeleteTarget(null)
    router.refresh()
  }

  function announcementStatus(announcement: Announcement) {
    const now = new Date()
    if (new Date(announcement.starts_at) > now) return "future"
    if (new Date(announcement.ends_at) < now) return "expired"
    return "active"
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground mt-1">{announcements.length} announcement{announcements.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Announcement
        </Button>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "Create Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Tournament Reminder"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body</Label>
              <textarea
                id="body"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Announcement details...&#10;&#10;Supports Slack formatting:&#10;*bold* _italic_ ~strikethrough~&#10;`code` ```code block```&#10;> quote"
              />
              <p className="text-xs text-muted-foreground">
                Supports Slack formatting: <code className="bg-muted px-1 rounded">*bold*</code> <code className="bg-muted px-1 rounded">_italic_</code> <code className="bg-muted px-1 rounded">~strikethrough~</code> <code className="bg-muted px-1 rounded">`code`</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkUrl">Link URL (optional)</Label>
              <Input
                id="linkUrl"
                value={form.linkUrl}
                onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                placeholder="https://example.com/details"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startsAt">Start Date</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">End Date</Label>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-semibold">Post to Slack</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Send this announcement to a Slack channel via the bot.
              </p>

              {allowedChannelIds.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="postToSlack"
                      checked={form.postToSlack}
                      onChange={(e) => setForm({ ...form, postToSlack: e.target.checked, slackChannelId: e.target.checked ? allowedChannelIds[0] : "" })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="postToSlack" className="text-sm">Also post to Slack channel</Label>
                  </div>

                  {form.postToSlack && (
                    <div className="space-y-2 ml-6">
                      <Label htmlFor="slackChannel">Select Channel</Label>
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        <select
                          id="slackChannel"
                          value={form.slackChannelId}
                          onChange={(e) => setForm({ ...form, slackChannelId: e.target.value })}
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
                        Channel must be in your allowed channels list in Integrations settings.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                  No Slack channels configured. Add allowed channels in{" "}
                  <a href={`/org/${org.slug}/dashboard/integrations/slack`} className="text-primary hover:underline">
                    Integrations
                  </a>{" "}
                  to enable Slack posting.
                </div>
              )}

              {slackError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{slackError}</p>
              )}
              {slackSuccess && (
                <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 rounded-md p-2">
                  Posted to Slack successfully!
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
            )}
            <Button onClick={saveAnnouncement} disabled={saving || slackPosting} className="w-full gap-2">
              {saving ? "Saving..." : editing ? "Save Changes" : "Create Announcement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Announcement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteAnnouncement} disabled={deleting} className="gap-2">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">No announcements yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create an announcement to display on your org page and share on Slack
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {announcements.map((a) => {
            const status = announcementStatus(a)
            return (
              <Card key={a.id} className={status === "active" ? "border-green-200 dark:border-green-800" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{a.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={status === "active" ? "success" : status === "future" ? "outline" : "secondary"}>
                        {status === "active" ? "Active" : status === "future" ? "Future" : "Expired"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(a)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">{a.body}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(a.starts_at)} — {formatDate(a.ends_at)}
                  </div>
                  {a.link_url && (
                    <a
                      href={a.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {a.link_url}
                    </a>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
