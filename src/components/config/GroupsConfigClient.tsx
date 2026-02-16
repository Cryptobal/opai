"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AdminGroup,
  type AdminGroupMembership,
  type GroupMemberRole,
  GROUP_COLORS,
  GROUP_MEMBER_ROLES,
  getGroupBadgeStyle,
  slugify,
} from "@/lib/groups";
import {
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface Props {
  userRole: string;
}

interface GroupFormData {
  name: string;
  description: string;
  color: string;
  slug: string;
}

const EMPTY_FORM: GroupFormData = {
  name: "",
  description: "",
  color: GROUP_COLORS[0].value,
  slug: "",
};

// ═══════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════

export default function GroupsConfigClient({ userRole }: Props) {
  // --- State ------------------------------------------------
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<GroupFormData>(EMPTY_FORM);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Members
  const [members, setMembers] = useState<AdminGroupMembership[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberAdminId, setNewMemberAdminId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<GroupMemberRole>("member");
  const [addingMember, setAddingMember] = useState(false);

  // Available admins for member selection
  const [availableAdmins, setAvailableAdmins] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [adminsLoaded, setAdminsLoaded] = useState(false);

  const canManage =
    userRole === "owner" || userRole === "admin" || userRole === "superadmin";
  const selectedGroup = groups.find((g: AdminGroup) => g.id === selectedGroupId) ?? null;

  // --- Data loading -----------------------------------------

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ops/groups");
      if (!res.ok) throw new Error("Error al cargar grupos");
      const json = await res.json();
      setGroups(json.data ?? []);
    } catch (err) {
      console.error("[GroupsConfig] fetchGroups error:", err);
      toast.error("No se pudieron cargar los grupos");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async (groupId: string) => {
    try {
      setMembersLoading(true);
      const res = await fetch(`/api/ops/groups/${groupId}/members`);
      if (!res.ok) throw new Error("Error al cargar miembros");
      const json = await res.json();
      setMembers(json.data ?? []);
    } catch (err) {
      console.error("[GroupsConfig] fetchMembers error:", err);
      toast.error("No se pudieron cargar los miembros del grupo");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const fetchAdmins = useCallback(async () => {
    if (adminsLoaded) return;
    try {
      const res = await fetch("/api/ops/admins");
      if (res.ok) {
        const json = await res.json();
        setAvailableAdmins(json.data ?? []);
      }
    } catch { /* ignore */ }
    setAdminsLoaded(true);
  }, [adminsLoaded]);

  useEffect(() => {
    fetchGroups();
    fetchAdmins();
  }, [fetchGroups, fetchAdmins]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchMembers(selectedGroupId);
    } else {
      setMembers([]);
    }
  }, [selectedGroupId, fetchMembers]);

  // --- Handlers ---------------------------------------------

  const handleNameChange = (name: string) => {
    setFormData((prev: GroupFormData) => ({
      ...prev,
      name,
      slug: slugify(name),
    }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setIsCreating(false);
    setIsEditing(false);
    setConfirmDelete(false);
  };

  const openCreate = () => {
    setSelectedGroupId(null);
    setIsEditing(false);
    setFormData(EMPTY_FORM);
    setIsCreating(true);
    setConfirmDelete(false);
  };

  const openEdit = (group: AdminGroup) => {
    setSelectedGroupId(group.id);
    setIsCreating(false);
    setIsEditing(true);
    setConfirmDelete(false);
    setFormData({
      name: group.name,
      description: group.description ?? "",
      color: group.color,
      slug: group.slug,
    });
  };

  const selectGroup = (group: AdminGroup) => {
    if (selectedGroupId === group.id && !isEditing) {
      setSelectedGroupId(null);
      resetForm();
      return;
    }
    setSelectedGroupId(group.id);
    setIsCreating(false);
    setIsEditing(false);
    setConfirmDelete(false);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("El nombre del grupo es obligatorio");
      return;
    }
    try {
      setSaving(true);
      const res = await fetch("/api/ops/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          color: formData.color,
          slug: formData.slug || slugify(formData.name),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? "Error al crear grupo");
      }
      const json = await res.json();
      setGroups((prev: AdminGroup[]) => [...prev, json.data]);
      resetForm();
      toast.success("Grupo creado correctamente");
    } catch (err) {
      console.error("[GroupsConfig] handleCreate error:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear el grupo"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedGroup) return;
    if (!formData.name.trim()) {
      toast.error("El nombre del grupo es obligatorio");
      return;
    }
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        description: formData.description.trim() || null,
      };
      // System groups: only description can be edited
      if (!selectedGroup.isSystem) {
        payload.name = formData.name.trim();
        payload.color = formData.color;
        payload.slug = formData.slug || slugify(formData.name);
      }
      const res = await fetch(`/api/ops/groups/${selectedGroup.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? "Error al actualizar grupo");
      }
      const json = await res.json();
      setGroups((prev: AdminGroup[]) =>
        prev.map((g: AdminGroup) => (g.id === selectedGroup.id ? json.data : g))
      );
      setIsEditing(false);
      toast.success("Grupo actualizado correctamente");
    } catch (err) {
      console.error("[GroupsConfig] handleUpdate error:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo actualizar el grupo"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup || selectedGroup.isSystem) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      setDeleting(true);
      const res = await fetch(`/api/ops/groups/${selectedGroup.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? "Error al eliminar grupo");
      }
      setGroups((prev: AdminGroup[]) => prev.filter((g: AdminGroup) => g.id !== selectedGroup.id));
      setSelectedGroupId(null);
      resetForm();
      toast.success("Grupo eliminado correctamente");
    } catch (err) {
      console.error("[GroupsConfig] handleDelete error:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo eliminar el grupo"
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !newMemberAdminId.trim()) {
      toast.error("Ingresa un ID de administrador");
      return;
    }
    try {
      setAddingMember(true);
      const res = await fetch(
        `/api/ops/groups/${selectedGroupId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminId: newMemberAdminId.trim(),
            role: newMemberRole,
          }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? "Error al agregar miembro");
      }
      const json = await res.json();
      setMembers((prev: AdminGroupMembership[]) => [...prev, json.data]);
      setNewMemberAdminId("");
      setNewMemberRole("member");
      toast.success("Miembro agregado al grupo");
    } catch (err) {
      console.error("[GroupsConfig] handleAddMember error:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo agregar el miembro"
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (adminId: string) => {
    if (!selectedGroupId) return;
    try {
      const res = await fetch(
        `/api/ops/groups/${selectedGroupId}/members`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId }),
        }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? "Error al remover miembro");
      }
      setMembers((prev: AdminGroupMembership[]) => prev.filter((m: AdminGroupMembership) => m.adminId !== adminId));
      toast.success("Miembro removido del grupo");
    } catch (err) {
      console.error("[GroupsConfig] handleRemoveMember error:", err);
      toast.error(
        err instanceof Error ? err.message : "No se pudo remover el miembro"
      );
    }
  };

  // --- Sub-renders ------------------------------------------

  const renderColorPicker = (
    value: string,
    onChange: (color: string) => void,
    disabled?: boolean
  ) => (
    <div className="grid grid-cols-5 gap-2">
      {GROUP_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          disabled={disabled}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`
            h-8 w-8 rounded-full border-2 transition-all
            ${
              value === c.value
                ? "border-foreground scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background"
                : "border-transparent hover:border-muted-foreground/40"
            }
            ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
          `}
          style={{ backgroundColor: c.value }}
          aria-label={c.label}
        />
      ))}
    </div>
  );

  const renderForm = (mode: "create" | "edit") => {
    const isSystem = mode === "edit" && selectedGroup?.isSystem;
    return (
      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="group-name">Nombre</Label>
          <Input
            id="group-name"
            placeholder="Ej: Soporte al cliente"
            value={formData.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
            disabled={!!isSystem || saving}
            maxLength={100}
          />
        </div>

        {/* Slug (read-only) */}
        <div className="space-y-1.5">
          <Label htmlFor="group-slug">Slug</Label>
          <Input
            id="group-slug"
            value={formData.slug}
            disabled
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Se genera automaticamente del nombre
          </p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="group-description">Descripcion</Label>
          <textarea
            id="group-description"
            placeholder="Descripcion opcional del grupo..."
            value={formData.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFormData((prev: GroupFormData) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            disabled={saving}
            rows={3}
            maxLength={500}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <Label>Color</Label>
          {renderColorPicker(
            formData.color,
            (color: string) => setFormData((prev: GroupFormData) => ({ ...prev, color })),
            !!isSystem
          )}
          <p className="text-xs text-muted-foreground">
            Color del badge del grupo
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={mode === "create" ? handleCreate : handleUpdate}
            disabled={saving || !formData.name.trim()}
            size="sm"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {mode === "create" ? "Crear grupo" : "Guardar cambios"}
          </Button>
          <Button variant="outline" size="sm" onClick={resetForm} disabled={saving}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  };

  const renderMembersSection = () => {
    if (!selectedGroupId || !selectedGroup) return null;
    return (
      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Miembros</h3>
          {membersLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Members list */}
        {members.length === 0 && !membersLoading ? (
          <p className="text-sm text-muted-foreground">
            Este grupo aun no tiene miembros
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((m: AdminGroupMembership) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {m.adminName ?? m.adminEmail ?? m.adminId}
                  </div>
                  {m.adminEmail && m.adminName && (
                    <div className="text-xs text-muted-foreground truncate">
                      {m.adminEmail}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === "lead" ? "default" : "secondary"}>
                    {GROUP_MEMBER_ROLES.find((r) => r.value === m.role)?.label ??
                      m.role}
                  </Badge>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(m.adminId)}
                      title="Remover del grupo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add member */}
        {canManage && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Agregar miembro
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Usuario</Label>
                <Select
                  value={newMemberAdminId}
                  onValueChange={(v: string) => setNewMemberAdminId(v)}
                  disabled={addingMember}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar usuario..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAdmins
                      .filter((a) => !members.some((m) => m.adminId === a.id))
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[160px] space-y-1.5">
                <Label className="text-xs">Rol en grupo</Label>
                <Select
                  value={newMemberRole}
                  onValueChange={(v: string) => setNewMemberRole(v as GroupMemberRole)}
                  disabled={addingMember}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_MEMBER_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={handleAddMember}
                disabled={addingMember || !newMemberAdminId.trim()}
                className="shrink-0"
              >
                {addingMember ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Agregar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Loading state ----------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Cargando grupos...
        </span>
      </div>
    );
  }

  // --- Empty state ------------------------------------------

  if (groups.length === 0 && !isCreating) {
    return (
      <div className="space-y-4">
        <div className="py-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground">
            No hay grupos configurados
          </p>
          {canManage && (
            <Button onClick={openCreate} className="mt-4" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Crear primer grupo
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- Main render ------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Grupos</h2>
          <p className="text-sm text-muted-foreground">
            {groups.length} grupo{groups.length !== 1 ? "s" : ""} configurado
            {groups.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && !isCreating && (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo grupo
          </Button>
        )}
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Crear nuevo grupo
          </h3>
          {renderForm("create")}
        </div>
      )}

      {/* ─── Mobile cards (< md) ────────────────────────── */}
      <div className="md:hidden space-y-3">
        {groups.map((group: AdminGroup) => {
          const badgeStyle = getGroupBadgeStyle(group.color);
          const isSelected = selectedGroupId === group.id;

          return (
            <div key={group.id}>
              <div
                className={`
                  rounded-lg border bg-card/40 p-4 transition-colors cursor-pointer
                  ${isSelected ? "border-primary/50 bg-card/60" : "border-border hover:border-border/80"}
                `}
                style={{ borderLeftWidth: "3px", borderLeftColor: group.color }}
                onClick={() => selectGroup(group)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className="border"
                        style={{
                          backgroundColor: badgeStyle.backgroundColor,
                          color: badgeStyle.color,
                          borderColor: badgeStyle.borderColor,
                        }}
                      >
                        {group.name}
                      </Badge>
                      {group.isSystem && (
                        <Badge variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Sistema
                        </Badge>
                      )}
                    </div>
                    {group.description && (
                      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Users className="h-3.5 w-3.5" />
                    {group.membersCount ?? 0}
                  </div>
                </div>

                {/* Slug */}
                <div className="mt-2 text-xs font-mono text-muted-foreground/60">
                  {group.slug}
                </div>

                {/* Actions row */}
                {canManage && isSelected && !isEditing && (
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        openEdit(group);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    {!group.isSystem && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDelete();
                        }}
                        disabled={deleting}
                      >
                        {deleting ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        {confirmDelete ? "Confirmar eliminar" : "Eliminar"}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Edit form inline (mobile) */}
              {isSelected && isEditing && (
                <div className="rounded-b-lg border border-t-0 border-border bg-card/40 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={resetForm}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <h3 className="text-sm font-semibold text-foreground">
                      Editar grupo
                    </h3>
                    {selectedGroup?.isSystem && (
                      <Badge variant="outline" className="gap-1 ml-auto">
                        <Shield className="h-3 w-3" />
                        Sistema
                      </Badge>
                    )}
                  </div>
                  {renderForm("edit")}
                </div>
              )}

              {/* Members (mobile) */}
              {isSelected && !isCreating && (
                <div className="rounded-b-lg border border-t-0 border-border bg-card/40 px-4 pb-4">
                  {renderMembersSection()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Desktop table (>= md) ──────────────────────── */}
      <div className="hidden md:block space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Grupo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Descripcion
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Miembros
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tipo
                </th>
                {canManage && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.map((group: AdminGroup) => {
                const badgeStyle = getGroupBadgeStyle(group.color);
                const isSelected = selectedGroupId === group.id;

                return (
                  <tr
                    key={group.id}
                    className={`
                      transition-colors cursor-pointer
                      ${isSelected ? "bg-muted/60" : "hover:bg-muted/30"}
                    `}
                    onClick={() => selectGroup(group)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <Badge
                          className="border"
                          style={{
                            backgroundColor: badgeStyle.backgroundColor,
                            color: badgeStyle.color,
                            borderColor: badgeStyle.borderColor,
                          }}
                        >
                          {group.name}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                      {group.slug}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                      {group.description ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {group.membersCount ?? 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {group.isSystem ? (
                        <Badge variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Sistema
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Personalizado</Badge>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Editar grupo"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              openEdit(group);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!group.isSystem && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              title="Eliminar grupo"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                setSelectedGroupId(group.id);
                                handleDelete();
                              }}
                              disabled={deleting}
                            >
                              {deleting && selectedGroupId === group.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel (desktop) */}
        {selectedGroupId && selectedGroup && (
          <div className="rounded-lg border border-border bg-card/40 p-6">
            {isEditing ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={resetForm}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h3 className="text-sm font-semibold text-foreground">
                    Editar grupo: {selectedGroup.name}
                  </h3>
                  {selectedGroup.isSystem && (
                    <Badge variant="outline" className="gap-1 ml-auto">
                      <Shield className="h-3 w-3" />
                      Solo descripcion editable
                    </Badge>
                  )}
                </div>
                {renderForm("edit")}
              </>
            ) : (
              <>
                {/* Group detail header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedGroup.color }}
                      />
                      <h3 className="text-base font-semibold text-foreground">
                        {selectedGroup.name}
                      </h3>
                      {selectedGroup.isSystem && (
                        <Badge variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Sistema
                        </Badge>
                      )}
                    </div>
                    {selectedGroup.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedGroup.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-mono text-muted-foreground/60">
                      {selectedGroup.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(selectedGroup)}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Editar
                      </Button>
                    )}
                    {canManage && !selectedGroup.isSystem && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        {confirmDelete ? "Confirmar eliminar" : "Eliminar"}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Members section */}
            {renderMembersSection()}
          </div>
        )}

        {/* Delete confirmation (desktop) */}
        {confirmDelete && selectedGroup && !selectedGroup.isSystem && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-foreground">
              Estas seguro de que quieres eliminar el grupo{" "}
              <strong>{selectedGroup.name}</strong>? Esta accion no se puede
              deshacer.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Si, eliminar grupo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
