"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Send, Hash, CheckCircle, AlertCircle, MessageSquare, Trash2 } from "lucide-react"
import type { Organization } from "@/lib/types"

interface AnnouncementsClientProps {
  org: Organization
  allowedChannelIds: string[]
}

function parseSlackMessageLink(link: string): { channelId: string; messageTs: string; threadTs: string | null } | null {
  try {
    const url = new URL(link)
    const pathParts = url.pathname.split("/")
    const channelIndex = pathParts.indexOf("archives")
    if (channelIndex === -1 || !pathParts[channelIndex + 1]) return null

    const channelId = pathParts[channelIndex + 1]
    const rawTs = pathParts[channelIndex + 2]
    if (!rawTs || !rawTs.startsWith("p")) return null

    const tsDigits = rawTs.slice(1)
    const messageTs = `${tsDigits.slice(0, 10)}.${tsDigits.slice(10)}`

    const threadTs = url.searchParams.get("thread_ts")

    return { channelId, messageTs, threadTs }
  } catch {
    return null
  }
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

  const [threadOpen, setThreadOpen] = useState(false)
  const [threadForm, setThreadForm] = useState({ messageLink: "", message: "" })
  const [threadSending, setThreadSending] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [threadSuccess, setThreadSuccess] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteForm, setDeleteForm] = useState({ messageLink: "" })
  const [deleteSending, setDeleteSending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  function resetForm() {
    setForm({ title: "", body: "", linkUrl: "", channelId: allowedChannelIds[0] || "" })
    setError(null)
    setSuccess(false)
  }

  function resetThreadForm() {
    setThreadForm({ messageLink: "", message: "" })
    setThreadError(null)
    setThreadSuccess(false)
  }

  function resetDeleteForm() {
    setDeleteForm({ messageLink: "" })
    setDeleteError(null)
    setDeleteSuccess(false)
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

  async function sendThreadReply() {
    if (!threadForm.messageLink || !threadForm.message) {
      setThreadError("Please paste a message link and type a reply")
      return
    }

    const parsed = parseSlackMessageLink(threadForm.messageLink)
    if (!parsed) {
      setThreadError("Invalid Slack message link. Please paste a link from Slack.")
      return
    }

    const replyTs = parsed.threadTs || parsed.messageTs

    setThreadSending(true)
    setThreadError(null)
    setThreadSuccess(false)

    try {
      const res = await fetch(`/api/org/${org.slug}/announcements/reply-thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: parsed.channelId,
          threadTs: replyTs,
          message: threadForm.message,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setThreadError(data.error || "Failed to post reply")
        setThreadSending(false)
        return
      }

      setThreadSuccess(true)
      setThreadSending(false)
      setTimeout(() => {
        setThreadOpen(false)
        resetThreadForm()
      }, 1500)
    } catch {
      setThreadError("Failed to post reply")
      setThreadSending(false)
    }
  }

  async function deleteSlackMessage() {
    if (!deleteForm.messageLink) {
      setDeleteError("Please paste a message link")
      return
    }

    const parsed = parseSlackMessageLink(deleteForm.messageLink)
    if (!parsed) {
      setDeleteError("Invalid Slack message link. Please paste a link from Slack.")
      return
    }

    setDeleteSending(true)
    setDeleteError(null)
    setDeleteSuccess(false)

    try {
      const res = await fetch(`/api/org/${org.slug}/announcements/delete-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: parsed.channelId,
          messageTs: parsed.messageTs,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete message")
        setDeleteSending(false)
        return
      }

      setDeleteSuccess(true)
      setDeleteSending(false)
      setTimeout(() => {
        setDeleteOpen(false)
        resetDeleteForm()
      }, 1500)
    } catch {
      setDeleteError("Failed to delete message")
      setDeleteSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Slack Announcements</h2>
          <p className="text-muted-foreground mt-1">Send announcements, reply in threads, or delete messages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => { resetThreadForm(); setThreadOpen(true) }} disabled={allowedChannelIds.length === 0}>
            <MessageSquare className="h-4 w-4" />
            Reply in Thread
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { resetDeleteForm(); setDeleteOpen(true) }} disabled={allowedChannelIds.length === 0}>
            <Trash2 className="h-4 w-4" />
            Delete Message
          </Button>
          <Button className="gap-2" onClick={openCreate} disabled={allowedChannelIds.length === 0}>
            <Send className="h-4 w-4" />
            Send Announcement
          </Button>
        </div>
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

      {/* Reply in Thread Dialog */}
      <Dialog open={threadOpen} onOpenChange={(v) => { setThreadOpen(v); if (!v) resetThreadForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reply in Thread</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="threadMessageLink">Slack Message Link</Label>
              <Input
                id="threadMessageLink"
                value={threadForm.messageLink}
                onChange={(e) => setThreadForm({ ...threadForm, messageLink: e.target.value })}
                placeholder="https://workspace.slack.com/archives/C039AJMTQ2D/p1784884460875899..."
              />
              <p className="text-xs text-muted-foreground">
                Paste the link to a Slack message. Right-click any message in Slack and select &quot;Copy link&quot;.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threadMessage">Reply Message</Label>
              <textarea
                id="threadMessage"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                value={threadForm.message}
                onChange={(e) => setThreadForm({ ...threadForm, message: e.target.value })}
                placeholder="Type your reply here..."
              />
            </div>

            <Separator />

            {threadError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="h-4 w-4" />
                {threadError}
              </div>
            )}
            {threadSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/50 rounded-md p-2">
                <CheckCircle className="h-4 w-4" />
                Reply posted successfully!
              </div>
            )}

            <Button onClick={sendThreadReply} disabled={threadSending || threadSuccess} className="w-full gap-2">
              {threadSending ? "Posting..." : threadSuccess ? "Posted!" : "Post Reply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Message Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) resetDeleteForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="deleteMessageLink">Slack Message Link</Label>
              <Input
                id="deleteMessageLink"
                value={deleteForm.messageLink}
                onChange={(e) => setDeleteForm({ ...deleteForm, messageLink: e.target.value })}
                placeholder="https://workspace.slack.com/archives/C039AJMTQ2D/p1784884460875899..."
              />
              <p className="text-xs text-muted-foreground">
                Paste the link to the bot message you want to delete. Right-click the message in Slack and select &quot;Copy link&quot;.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Note: Only messages posted by the bot can be deleted.
              </p>
            </div>

            <Separator />

            {deleteError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="h-4 w-4" />
                {deleteError}
              </div>
            )}
            {deleteSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/50 rounded-md p-2">
                <CheckCircle className="h-4 w-4" />
                Message deleted successfully!
              </div>
            )}

            <Button onClick={deleteSlackMessage} disabled={deleteSending || deleteSuccess} className="w-full gap-2" variant="destructive">
              {deleteSending ? "Deleting..." : deleteSuccess ? "Deleted!" : "Delete Message"}
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
