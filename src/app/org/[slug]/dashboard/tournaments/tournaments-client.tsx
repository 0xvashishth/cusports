"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Trophy, Plus, CalendarRange, MoreVertical, Pencil, Trash2, Eye, MapPin } from "lucide-react"
import { DEFAULT_CATEGORIES_DATA } from "@/lib/constants"
import type { Tournament, Organization } from "@/lib/types"

interface TournamentsClientProps {
  org: Organization
  tournaments: Tournament[]
}

const statusVariants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  draft: "warning",
  published: "success",
  in_progress: "default",
  completed: "secondary",
}

export function TournamentsClient({ org, tournaments }: TournamentsClientProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null)
  const [form, setForm] = useState({
    name: "",
    venue: "",
    startDate: "",
    endDate: "",
    selectedCategories: [] as string[],
  })
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, { points_per_game: number; games_per_match: number; win_by_two: boolean }>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null)
  const [deleting, setDeleting] = useState(false)

  function openCreate() {
    setEditingTournament(null)
    setForm({ name: "", venue: "", startDate: "", endDate: "", selectedCategories: [] })
    setCategoryConfigs({})
    setError(null)
    setOpen(true)
  }

  async function openEdit(t: Tournament) {
    setError(null)
    const supabase = createClient()

    const { data: tcs } = await supabase
      .from("tournament_categories")
      .select("category:categories(name), points_per_game, games_per_match, win_by_two")
      .eq("tournament_id", t.id)

    const selectedNames = (tcs || [])
      .map((tc: Record<string, unknown>) => (tc.category as Record<string, unknown>)?.name as string)
      .filter(Boolean)

    const configs: Record<string, { points_per_game: number; games_per_match: number; win_by_two: boolean }> = {}
    for (const tc of tcs || []) {
      const tcData = tc as unknown as Record<string, unknown>
      const catName = (tcData.category as unknown as Record<string, unknown>)?.name as string
      if (catName) {
        configs[catName] = {
          points_per_game: tcData.points_per_game as number || 11,
          games_per_match: tcData.games_per_match as number || 5,
          win_by_two: (tcData.win_by_two as boolean) ?? true,
        }
      }
    }

    setEditingTournament(t)
    setForm({
      name: t.name,
      venue: t.venue || "",
      startDate: t.start_date,
      endDate: t.end_date,
      selectedCategories: selectedNames,
    })
    setCategoryConfigs(configs)
    setOpen(true)
  }

  function toggleCategory(catName: string) {
    const isSelected = form.selectedCategories.includes(catName)
    setForm((prev) => ({
      ...prev,
      selectedCategories: isSelected
        ? prev.selectedCategories.filter((n) => n !== catName)
        : [...prev.selectedCategories, catName],
    }))

    if (!isSelected) {
      setCategoryConfigs((prev) => ({
        ...prev,
        [catName]: { points_per_game: 11, games_per_match: 5, win_by_two: true },
      }))
    } else {
      setCategoryConfigs((prev) => {
        const next = { ...prev }
        delete next[catName]
        return next
      })
    }
  }

  function updateCategoryConfig(catName: string, key: string, value: number | boolean) {
    setCategoryConfigs((prev) => ({
      ...prev,
      [catName]: { ...prev[catName], [key]: value },
    }))
  }

  async function saveTournament() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    if (editingTournament) {
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({
          name: form.name,
          venue: form.venue || null,
          start_date: form.startDate,
          end_date: form.endDate,
        })
        .eq("id", editingTournament.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }

      const { data: existingTCs } = await supabase
        .from("tournament_categories")
        .select("id, category:categories(name)")
        .eq("tournament_id", editingTournament.id)

      const existingNames = (existingTCs || [])
        .map((tc: Record<string, unknown>) => (tc.category as Record<string, unknown>)?.name as string)
        .filter(Boolean)

      const toRemove = existingNames.filter((n) => !form.selectedCategories.includes(n))
      const toAdd = form.selectedCategories.filter((n) => !existingNames.includes(n))

      if (toRemove.length > 0) {
        const { data: catsToRemove } = await supabase
          .from("categories")
          .select("id, name")
          .in("name", toRemove)
          .eq("organization_id", org.id)

        if (catsToRemove) {
          await supabase
            .from("tournament_categories")
            .delete()
            .eq("tournament_id", editingTournament.id)
            .in(
              "category_id",
              catsToRemove.map((c) => c.id)
            )
        }
      }

      for (const catName of toAdd) {
        const catDef = DEFAULT_CATEGORIES_DATA.find((c) => c.name === catName)
        if (!catDef) continue
        const config = categoryConfigs[catName] || { points_per_game: 11, games_per_match: 5, win_by_two: true }

        const { data: existing } = await supabase
          .from("categories")
          .select("id")
          .eq("organization_id", org.id)
          .eq("name", catName)
          .maybeSingle()

        let categoryId: string
        if (existing) {
          categoryId = existing.id
        } else {
          const { data: newCat, error: catError } = await supabase
            .from("categories")
            .insert({ organization_id: org.id, name: catDef.name, is_doubles: catDef.is_doubles })
            .select()
            .single()
          if (catError || !newCat) {
            setError(catError?.message || `Failed to create category "${catName}"`)
            setSaving(false)
            return
          }
          categoryId = newCat.id
        }

        await supabase.from("tournament_categories").insert({
          tournament_id: editingTournament.id,
          category_id: categoryId,
          points_per_game: config.points_per_game,
          games_per_match: config.games_per_match,
          win_by_two: config.win_by_two,
          format_type: "knockout",
        })
      }
    } else {
      const res = await fetch(`/api/org/${org.slug}/tournaments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          venue: form.venue,
          startDate: form.startDate,
          endDate: form.endDate,
          selectedCategories: form.selectedCategories,
          categoryConfigs,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create tournament")
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setOpen(false)
    setEditingTournament(null)
    setForm({ name: "", venue: "", startDate: "", endDate: "", selectedCategories: [] })
    setError(null)
    router.refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)

    const res = await fetch(`/api/org/${org.slug}/tournaments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: deleteTarget.id }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      setError(data.error || "Failed to delete tournament")
      setDeleting(false)
      setDeleteTarget(null)
      return
    }

    setDeleting(false)
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
          <p className="text-muted-foreground mt-1">{tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Tournament
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTournament ? "Edit Tournament" : "Create Tournament"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Summer Open 2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venues (comma separated)</Label>
              <Input
                id="venue"
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                placeholder="Hall A, Room 204, Main Gym"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categories</Label>
              <div className="space-y-1 border rounded-lg p-3">
                {DEFAULT_CATEGORIES_DATA.map((cat) => {
                  const isSelected = form.selectedCategories.includes(cat.name)
                  const config = categoryConfigs[cat.name]
                  return (
                    <div key={cat.name}>
                      <label className="flex items-center gap-3 text-sm py-1.5 cursor-pointer hover:text-foreground">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCategory(cat.name)}
                          className="rounded border-input"
                        />
                        {cat.name}
                      </label>
                      {isSelected && config && (
                        <div className="ml-7 mb-2 p-2 rounded-md border bg-muted/30 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Points per game</Label>
                            <select
                              className="flex h-7 w-full rounded border border-input bg-background px-1 text-xs mt-0.5"
                              value={config.points_per_game}
                              onChange={(e) => updateCategoryConfig(cat.name, "points_per_game", parseInt(e.target.value))}
                            >
                              <option value={11}>11</option>
                              <option value={21}>21</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Games per match</Label>
                            <select
                              className="flex h-7 w-full rounded border border-input bg-background px-1 text-xs mt-0.5"
                              value={config.games_per_match}
                              onChange={(e) => updateCategoryConfig(cat.name, "games_per_match", parseInt(e.target.value))}
                            >
                              <option value={3}>Best of 3</option>
                              <option value={5}>Best of 5</option>
                              <option value={7}>Best of 7</option>
                            </select>
                          </div>
                          <div className="flex items-end pb-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={config.win_by_two}
                                onChange={(e) => updateCategoryConfig(cat.name, "win_by_two", e.target.checked)}
                                className="rounded border-input"
                              />
                              Win by 2
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
            )}
            <Button onClick={saveTournament} disabled={saving} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              {saving ? "Saving..." : editingTournament ? "Save Changes" : "Create Tournament"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {tournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">No tournaments yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first tournament to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => (
            <Card key={t.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">
                    <Link href={`/org/${org.slug}/dashboard/tournaments/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Trophy className="h-4 w-4 text-muted-foreground" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/org/${org.slug}/dashboard/tournaments/${t.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.venue && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {t.venue}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarRange className="h-4 w-4" />
                  {new Date(t.start_date).toLocaleDateString()} — {new Date(t.end_date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariants[t.status] || "outline"}>
                    {t.status === "in_progress" ? "In Progress" : t.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              This will also remove all matches and scores associated with this tournament.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
