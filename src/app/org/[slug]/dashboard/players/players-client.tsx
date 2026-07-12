"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Users, UserPlus, Shield, Mail, Calendar, Upload, FileText } from "lucide-react"
import { formatDate, cn } from "@/lib/utils"
import type { OrgMember, Organization, Ranking, Category } from "@/lib/types"

interface CsvRow {
  Name: string
  Email: string
  "Initial Ranking": string
  Categories: string
}

interface PlayersClientProps {
  org: Organization
  members: (OrgMember & { profile: { full_name: string | null; email: string | null } | null })[]
  rankings: (Ranking & { category_name: string })[]
  categories: Category[]
}

export function PlayersClient({ org, members, rankings, categories }: PlayersClientProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: "", fullName: "", rating: "", unranked: false })
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const players = members.filter((m) => m.org_role === "player")
  const managers = members.filter((m) => m.org_role === "manager")

  async function addPlayer() {
    setAdding(true)
    setError(null)

    const rating = form.unranked ? null : (parseInt(form.rating) || 1000)
    const res = await fetch(`/api/org/${org.slug}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, fullName: form.fullName, rating, category_ids: selectedCategories.length > 0 ? selectedCategories : undefined }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }))
      setError(err.error || "Failed to add player")
      setAdding(false)
      return
    }

    setAdding(false)
    setOpen(false)
    setForm({ email: "", fullName: "", rating: "", unranked: false })
    setSelectedCategories([])
    setError(null)
    router.refresh()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        setCsvRows(results.data.filter((r) => r.Name && r.Email))
      },
    })
  }

  async function importCsv() {
    setImporting(true)

    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))

    let successCount = 0
    let failCount = 0

    for (const row of csvRows) {
      const raw = row["Initial Ranking"]?.trim()
      const rating = raw ? (parseInt(raw) || 1000) : null
      const catNames = (row.Categories || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      const category_ids = catNames.length > 0 ? catNames.map((n) => categoryByName.get(n)).filter(Boolean) as string[] : undefined
      const res = await fetch(`/api/org/${org.slug}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: row.Email, fullName: row.Name, rating, category_ids }),
      })
      if (res.ok) successCount++
      else failCount++
    }

    setImporting(false)
    setCsvOpen(false)
    setCsvRows([])
    if (fileRef.current) fileRef.current.value = ""
    if (failCount > 0) {
      setError(`${successCount} added, ${failCount} failed`)
    }
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Players</h1>
          <p className="text-muted-foreground mt-1">{players.length} player{players.length !== 1 ? "s" : ""} registered</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Add Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Player to {org.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="player@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="unranked"
                  checked={form.unranked}
                  onChange={(e) => setForm({ ...form, unranked: e.target.checked })}
                  className="rounded border-input"
                />
                <Label htmlFor="unranked" className="text-sm">Unranked (skip initial rating)</Label>
              </div>
              {!form.unranked && (
                <div className="space-y-2">
                  <Label htmlFor="rating">Initial Rating</Label>
                  <Input
                    id="rating"
                    type="number"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: e.target.value })}
                    placeholder="1000"
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">Default: 1000 if left empty</p>
                </div>
              )}
              {categories.length > 0 && !form.unranked && (
                <div className="space-y-2">
                  <Label className="text-sm">Categories</Label>
                  <p className="text-xs text-muted-foreground">Leave all unchecked to seed rankings in all categories</p>
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat.id)}
                          onChange={(e) =>
                            setSelectedCategories(
                              e.target.checked
                                ? [...selectedCategories, cat.id]
                                : selectedCategories.filter((id) => id !== cat.id)
                            )
                          }
                          className="rounded border-input"
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
              )}
              <Button onClick={addPlayer} disabled={adding} className="w-full gap-2">
                <UserPlus className="h-4 w-4" />
                {adding ? "Adding..." : "Add Player"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {managers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Managers</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {managers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <Avatar>
                    <AvatarFallback>
                      {(m.profile?.full_name || "M").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{m.profile?.full_name || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground truncate">{m.profile?.email}</p>
                  </div>
                  <Badge variant="secondary">Manager</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">All Players</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">No players yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first player to get started
              </p>
              <div className="flex gap-3 mt-6">
                <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Import from CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Import Players from CSV</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4" />
                          Expected CSV format
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your CSV must include these columns:
                        </p>
                        <div className="text-xs font-mono bg-muted rounded p-2">
                          Name, Email, Initial Ranking, Categories
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <strong>Name</strong> &mdash; Player&apos;s full name<br />
                          <strong>Email</strong> &mdash; Player&apos;s email address<br />
                          <strong>Initial Ranking</strong> &mdash; Starting ELO rating (e.g. 1000). Leave empty for unranked.<br />
                          <strong>Categories</strong> &mdash; Comma-separated category names (e.g. &ldquo;Men&apos;s Singles,Men&apos;s Doubles&rdquo;). Leave empty to seed all categories.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="csv">Choose CSV file</Label>
                        <Input
                          id="csv"
                          ref={fileRef}
                          type="file"
                          accept=".csv"
                          onChange={handleFileChange}
                        />
                      </div>
                      {csvRows.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            {csvRows.length} player{csvRows.length !== 1 ? "s" : ""} found
                          </p>
                          <div className="max-h-40 overflow-y-auto rounded border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-muted/50">
                                      <th className="text-left p-2">Name</th>
                                      <th className="text-left p-2">Email</th>
                                      <th className="text-right p-2">Rating</th>
                                      <th className="text-left p-2">Categories</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {csvRows.slice(0, 20).map((row, i) => (
                                      <tr key={i} className="border-t">
                                        <td className="p-2">{row.Name}</td>
                                        <td className="p-2 text-muted-foreground">{row.Email}</td>
                                        <td className="p-2 text-right">{row["Initial Ranking"]?.trim() ? row["Initial Ranking"] : <span className="text-muted-foreground italic">Unranked</span>}</td>
                                        <td className="p-2 text-muted-foreground">{row.Categories || <span className="italic">All</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                          </div>
                        </div>
                      )}
                      <Button
                        onClick={importCsv}
                        disabled={csvRows.length === 0 || importing}
                        className="w-full gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {importing ? "Importing..." : `Import ${csvRows.length} Player${csvRows.length !== 1 ? "s" : ""}`}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ) : (
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>W-L</TableHead>
                  <TableHead>Played</TableHead>
                  <TableHead>Ratings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((m) => {
                  const ratings = rankings.filter((r) => r.entity_id === m.profile_id)
                  const totalPlayed = ratings.reduce((s, r) => s + r.matches_played, 0)
                  const totalWins = ratings.reduce((s, r) => s + r.wins, 0)
                  const totalLosses = ratings.reduce((s, r) => s + r.losses, 0)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {(m.profile?.full_name || "P").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Link href={`/org/${org.slug}/players/${m.profile_id}`} className="hover:underline">
                            {m.profile?.full_name || "Unknown"}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {m.profile?.email || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        <span className="text-green-600 dark:text-green-400 font-medium">{totalWins}</span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-red-600 dark:text-red-400 font-medium">{totalLosses}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {totalPlayed}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {ratings.length > 0 ? ratings.map((r, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className={cn(
                                "text-xs font-mono",
                                r.rating && r.rating >= 1200 && "border-green-500/40 text-green-600 dark:text-green-400",
                                r.rating && r.rating < 1200 && r.rating >= 900 && "border-amber-500/40 text-amber-600 dark:text-amber-400",
                                r.rating && r.rating < 900 && r.rating !== null && "border-red-500/40 text-red-600 dark:text-red-400",
                                r.rating === null && "border-muted-foreground/30 text-muted-foreground italic",
                              )}
                            >
                              {(r as any).category_name || "Unknown"}: {r.rating ?? "Unranked"}
                            </Badge>
                          )) : <span className="text-xs text-muted-foreground italic">No rankings</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === "active" ? "success" : "warning"}>
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(m.created_at)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
