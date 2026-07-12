"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Organization } from "@/lib/types"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Building2, Users, Trophy, MoreVertical, Pencil, Trash2 } from "lucide-react"

export default function AdminOrganizationsPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<(Organization & { player_count?: number; tournament_count?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [form, setForm] = useState({ name: "", slug: "", managerEmail: "", managerName: "", managerPassword: "" })
  const [editForm, setEditForm] = useState({ name: "", slug: "", is_active: true, ranking_model: "elo" as string })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadOrgs()
  }, [])

  async function loadOrgs() {
    const supabase = createClient()
    const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false })
    if (data) {
      const enriched = await Promise.all(
        data.map(async (org) => {
          const { count: playerCount } = await supabase
            .from("org_members")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", org.id)
            .eq("org_role", "player")

          const { count: tournamentCount } = await supabase
            .from("tournaments")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", org.id)

          return {
            ...org,
            player_count: playerCount ?? 0,
            tournament_count: tournamentCount ?? 0,
          }
        })
      )
      setOrgs(enriched)
    }
    setLoading(false)
  }

  async function createOrg() {
    setCreating(true)
    setCreateError(null)

    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        setCreateError(err.error || "Request failed")
        setCreating(false)
        return
      }

      setCreateOpen(false)
      setForm({ name: "", slug: "", managerEmail: "", managerName: "", managerPassword: "" })
      loadOrgs()
    } catch (e) {
      setCreateError("Network error — check console")
      console.error(e)
    }
    setCreating(false)
  }

  function openEdit(org: Organization) {
    setEditingOrg(org)
    setEditForm({ name: org.name, slug: org.slug, is_active: org.is_active, ranking_model: org.ranking_model })
    setEditOpen(true)
  }

  async function saveOrg() {
    if (!editingOrg) return
    setSaving(true)
    setEditError(null)

    const res = await fetch("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingOrg.id,
        name: editForm.name,
        slug: editForm.slug,
        is_active: editForm.is_active,
        ranking_model: editForm.ranking_model,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }))
      setEditError(err.error || "Failed to update organization")
      setSaving(false)
      return
    }

    setSaving(false)
    setEditOpen(false)
    setEditingOrg(null)
    setEditError(null)
    loadOrgs()
  }

  async function deleteOrg(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/admin/organizations?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }))
      setEditError(err.error || "Failed to delete organization")
      setDeleting(null)
      return
    }
    setDeleting(null)
    loadOrgs()
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Manage all organizations on the platform</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Create a new organization and invite a manager to run it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug (URL identifier)</Label>
                <Input
                  id="org-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="my-org"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-email">Manager Email</Label>
                <Input
                  id="manager-email"
                  type="email"
                  value={form.managerEmail}
                  onChange={(e) => setForm({ ...form, managerEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-name">Manager Name</Label>
                <Input
                  id="manager-name"
                  value={form.managerName}
                  onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manager-password">Manager Password</Label>
                <Input
                  id="manager-password"
                  type="password"
                  value={form.managerPassword}
                  onChange={(e) => setForm({ ...form, managerPassword: e.target.value })}
                  placeholder="Set initial password"
                />
              </div>
              {createError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{createError}</p>
              )}
              <Button onClick={createOrg} disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create Organization"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Card key={org.id} className="relative cursor-pointer" onClick={() => router.push(`/org/${org.slug}/dashboard`)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                    <CardTitle className="text-lg truncate">{org.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={org.is_active ? "success" : "secondary"} className="shrink-0">
                      {org.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => openEdit(org)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Delete "${org.name}"? This will permanently delete all tournaments, matches, rankings, and members associated with this organization.`
                            )
                            if (confirmed) deleteOrg(org.id)
                          }}
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
                <p className="text-sm text-muted-foreground">/{org.slug}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {org.player_count} players
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="h-4 w-4" />
                    {org.tournament_count} tournaments
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Model: {org.ranking_model}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update organization details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Organization Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-model">Ranking Model</Label>
              <Select
                value={editForm.ranking_model}
                onValueChange={(v) => setEditForm({ ...editForm, ranking_model: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elo">ELO</SelectItem>
                  <SelectItem value="points">Points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Active</Label>
              <Switch
                id="edit-active"
                checked={editForm.is_active}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })}
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{editError}</p>
            )}
            <Button onClick={saveOrg} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
