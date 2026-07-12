"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Users, Shield, UserCog, User, Trash2, Pencil } from "lucide-react"
import { formatDate } from "@/lib/utils"

interface UserWithProfile {
  id: string
  full_name: string | null
  email: string | null
  platform_role: string
  created_at: string
  org_count?: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithProfile | null>(null)
  const [editRole, setEditRole] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (profiles) {
      const usersWithOrgs = await Promise.all(
        profiles.map(async (p) => {
          const { count } = await supabase
            .from("org_members")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", p.id)
          return { ...p, org_count: count || 0 }
        })
      )
      setUsers(usersWithOrgs)
    }
    setLoading(false)
  }

  async function deleteUser(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }))
      setError(err.error || "Failed to delete user")
      setDeleting(null)
      return
    }
    setDeleting(null)
    load()
  }

  function openEdit(user: UserWithProfile) {
    setEditingUser(user)
    setEditRole(user.platform_role)
    setEditOpen(true)
  }

  async function saveUser() {
    if (!editingUser) return
    setSaving(true)
    setError(null)

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingUser.id, platform_role: editRole }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }))
      setError(err.error || "Failed to update user")
      setSaving(false)
      return
    }

    setSaving(false)
    setEditOpen(false)
    setEditingUser(null)
    setError(null)
    load()
  }

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Shield className="h-4 w-4" />
      case "manager": return <UserCog className="h-4 w-4" />
      default: return <User className="h-4 w-4" />
    }
  }

  const roleVariant = (role: string) => {
    switch (role) {
      case "admin": return "default" as const
      case "manager": return "success" as const
      default: return "secondary" as const
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">All Users</h1>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">All Users</h1>
          <p className="text-muted-foreground">All registered platform users</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Users className="h-4 w-4 mr-2" />
          {users.length} total
        </Badge>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No users yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="py-3 flex items-center gap-4">
                <Avatar>
                  <AvatarFallback>
                    {(user.full_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <button onClick={() => openEdit(user)} className="font-medium truncate hover:underline text-left">
                    {user.full_name || "Unknown"}
                  </button>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{user.org_count} orgs</span>
                  <span>{formatDate(user.created_at)}</span>
                </div>
                <Badge variant={roleVariant(user.platform_role)} className="flex items-center gap-1">
                  {roleIcon(user.platform_role)}
                  {user.platform_role}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete <strong>{user.full_name || user.email}</strong>?
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleting === user.id}
                        onClick={() => deleteUser(user.id)}
                      >
                        {deleting === user.id ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>Change platform role for {editingUser?.full_name || editingUser?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Platform Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="player">Player</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
            )}
            <Button onClick={saveUser} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
