"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  type RolePermissions,
  type PermissionLevel,
  type ModuleKey,
  type CapabilityKey,
  MODULE_META,
  SUBMODULE_META,
  CAPABILITY_META,
  PERMISSION_LEVELS,
  LEVEL_LABELS,
  LEVEL_RANK,
  SUBMODULE_KEYS,
  getEffectiveLevel,
  EMPTY_PERMISSIONS,
  getDefaultPermissions,
  mergeRolePermissions,
} from "@/lib/permissions";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Shield,
  ShieldCheck,
  Users,
  Save,
  X,
  Loader2,
  Lock,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

interface RoleTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: RolePermissions;
  usersCount: number;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════
//  Permission Level Selector
// ═══════════════════════════════════════════

const LEVEL_COLORS: Record<PermissionLevel, string> = {
  none: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  view: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  edit: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  full: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

function PermissionLevelPill({
  level,
  onChange,
  disabled,
  inherited,
}: {
  level: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
  inherited?: boolean;
}) {
  return (
    <div className="relative inline-flex">
      <select
        value={inherited ? "__inherited" : level}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "__inherited") return;
          onChange(val as PermissionLevel);
        }}
        disabled={disabled}
        className={cn(
          "appearance-none rounded-full px-3 py-1 text-xs font-medium cursor-pointer border transition-colors pr-7",
          disabled ? "opacity-50 cursor-not-allowed" : "",
          inherited
            ? "bg-transparent text-muted-foreground border-dashed border-border"
            : cn(LEVEL_COLORS[level], "border-transparent"),
        )}
      >
        {inherited && (
          <option value="__inherited" disabled>
            heredado ({LEVEL_LABELS[level]})
          </option>
        )}
        {PERMISSION_LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none opacity-40" />
    </div>
  );
}

// ═══════════════════════════════════════════
//  Permission Editor (for a single template)
// ═══════════════════════════════════════════

function PermissionEditor({
  permissions,
  onChange,
  disabled,
}: {
  permissions: RolePermissions;
  onChange: (perms: RolePermissions) => void;
  disabled?: boolean;
}) {
  const [expandedModules, setExpandedModules] = useState<Set<ModuleKey>>(new Set());

  const toggleModule = (mod: ModuleKey) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const setModuleLevel = (mod: ModuleKey, level: PermissionLevel) => {
    const next = { ...permissions, modules: { ...permissions.modules, [mod]: level } };
    // Cuando cambias el módulo, limpiar overrides de submódulos (cascada limpia)
    const nextSubs = { ...next.submodules };
    const subs = SUBMODULE_KEYS[mod] as readonly string[];
    for (const s of subs) {
      delete nextSubs[`${mod}.${s}`];
    }
    next.submodules = nextSubs;
    onChange(next);
  };

  const setSubmoduleLevel = (mod: ModuleKey, sub: string, level: PermissionLevel) => {
    const parentLevel = permissions.modules[mod] ?? "none";
    const subKey = `${mod}.${sub}`;
    const next = { ...permissions, modules: { ...permissions.modules }, submodules: { ...permissions.submodules } };

    if (level === parentLevel) {
      // Si el nivel es igual al padre, remover override (vuelve a heredar)
      delete next.submodules[subKey];
    } else {
      next.submodules[subKey] = level;
    }

    // Auto-bump: si algún submódulo tiene nivel > padre, subir padre a "view" mínimo
    if (LEVEL_RANK[level] > LEVEL_RANK[parentLevel] && parentLevel === "none") {
      next.modules[mod] = "view";
    }

    onChange(next);
  };

  const toggleCapability = (cap: CapabilityKey) => {
    const next = {
      ...permissions,
      capabilities: {
        ...permissions.capabilities,
        [cap]: !permissions.capabilities[cap],
      },
    };
    onChange(next);
  };

  const setHubLayout = (layout: "default" | "supervisor") => {
    onChange({ ...permissions, hubLayout: layout });
  };

  const capabilitiesByModule = useMemo(() => {
    const map = new Map<ModuleKey, typeof CAPABILITY_META>();
    for (const cap of CAPABILITY_META) {
      if (!cap.moduleKey) continue;
      const list = map.get(cap.moduleKey) ?? [];
      list.push(cap);
      map.set(cap.moduleKey, list);
    }
    return map;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Módulos y capacidades
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          Asigna nivel de acceso por módulo. Las capacidades especiales aparecen dentro de cada módulo que corresponda.
        </p>
        <div className="rounded-lg border border-border divide-y divide-border bg-card">
          {MODULE_META.map((mod) => {
            const isExpanded = expandedModules.has(mod.key);
            const moduleLevel = permissions.modules[mod.key] ?? "none";
            const subs = SUBMODULE_META.filter((s) => s.module === mod.key);
            const caps = capabilitiesByModule.get(mod.key) ?? [];
            const hasSubs = subs.length > 0;
            const isHub = mod.key === "hub";
            const isCpq = mod.key === "cpq";
            const overrideCount = subs.filter(
              (s) => `${mod.key}.${s.submodule}` in permissions.submodules,
            ).length;

            return (
              <div key={mod.key}>
                <div className="flex items-center gap-2 px-4 py-3">
                  {(hasSubs || isHub) ? (
                    <button
                      onClick={() => toggleModule(mod.key)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      type="button"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium">{mod.label}</span>
                      {overrideCount > 0 && (
                        <span className="text-[10px] font-medium bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                          {overrideCount} override{overrideCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {caps.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{caps.length} capacidad{caps.length !== 1 ? "es" : ""}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="flex-1 text-sm font-medium">{mod.label}</span>
                  )}
                  <PermissionLevelPill
                    level={moduleLevel}
                    onChange={(l) => setModuleLevel(mod.key, l)}
                    disabled={disabled}
                  />
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-accent/20">
                    {/* Hub: tipo de inicio */}
                    {isHub && (
                      <div className="flex items-center justify-between pl-11 pr-4 py-2.5 border-t border-border/50 first:border-t-0">
                        <span className="text-xs text-muted-foreground">
                          Tipo de inicio (Hub)
                        </span>
                        <select
                          value={permissions.hubLayout ?? "default"}
                          onChange={(e) =>
                            setHubLayout(
                              e.target.value === "supervisor"
                                ? "supervisor"
                                : "default",
                            )
                          }
                          disabled={disabled}
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium"
                        >
                          <option value="default">Normal (admin)</option>
                          <option value="supervisor">Supervisor (terreno)</option>
                        </select>
                      </div>
                    )}

                    {/* Submódulos (Ops, CRM, etc.) */}
                    {subs.map((sub) => {
                      const subKey = `${mod.key}.${sub.submodule}`;
                      const hasOverride = subKey in permissions.submodules;
                      const effectiveLevel = getEffectiveLevel(
                        permissions,
                        mod.key,
                        sub.submodule,
                      );
                      return (
                        <div
                          key={subKey}
                          className="flex items-center justify-between pl-11 pr-4 py-2.5 border-t border-border/50 first:border-t-0"
                        >
                          <span className="text-xs text-muted-foreground">
                            {sub.label}
                          </span>
                          <PermissionLevelPill
                            level={effectiveLevel}
                            onChange={(l) =>
                              setSubmoduleLevel(mod.key, sub.submodule, l)
                            }
                            disabled={disabled}
                            inherited={!hasOverride}
                          />
                        </div>
                      );
                    })}

                    {/* Capacidades de este módulo */}
                    {caps.length > 0 && (
                      <>
                        <div className="pl-11 pr-4 pt-2 pb-1 border-t border-border/50">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Capacidades
                          </span>
                        </div>
                        {caps.map((cap) => (
                          <label
                            key={cap.key}
                            className={cn(
                              "flex items-center gap-3 pl-11 pr-4 py-2 cursor-pointer transition-colors hover:bg-accent/40 border-t border-border/30",
                              disabled && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={permissions.capabilities[cap.key] === true}
                              onChange={() => toggleCapability(cap.key)}
                              disabled={disabled}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-tight">
                                {cap.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {cap.description}
                              </p>
                            </div>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Role Template Card
// ═══════════════════════════════════════════

function RoleTemplateCard({
  template,
  isOwner,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: RoleTemplate;
  isOwner: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const canModify = !template.isSystem || (template.slug === "admin" && isOwner);
  const canRemove = !template.isSystem && template.usersCount === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              template.isSystem
                ? "bg-primary/10 text-primary"
                : "bg-accent text-muted-foreground",
            )}
          >
            {template.isSystem ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <Shield className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{template.name}</h3>
              {template.isSystem && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  <Lock className="h-2.5 w-2.5" />
                  Sistema
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {template.description || `Slug: ${template.slug}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Users className="h-3 w-3" />
            {template.usersCount}
          </span>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title={canModify ? "Editar permisos" : "Ver permisos"}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title="Duplicar rol"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {canRemove && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Quick permission summary */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {MODULE_META.filter((m) => m.key !== "hub").map((mod) => {
          const perms = template.permissions as RolePermissions;
          const level = perms.modules?.[mod.key] ?? "none";
          if (level === "none") return null;
          return (
            <span
              key={mod.key}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                LEVEL_COLORS[level],
              )}
            >
              {mod.label}: {LEVEL_LABELS[level]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Edit/Create Panel
// ═══════════════════════════════════════════

function RoleEditPanel({
  template,
  isOwner,
  onSave,
  onCancel,
}: {
  template: RoleTemplate | null; // null = crear nuevo
  isOwner: boolean;
  onSave: (data: {
    name: string;
    description: string;
    permissions: RolePermissions;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const isNew = !template;
  const canModify =
    isNew || !template.isSystem || (template.slug === "admin" && isOwner);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [permissions, setPermissions] = useState<RolePermissions>(() => {
    if (!template) return { modules: {}, submodules: {}, capabilities: {} };
    const raw = template.permissions as RolePermissions;
    const defaults = getDefaultPermissions(template.slug);
    if (!defaults || !defaults.modules || Object.keys(defaults.modules).length === 0) {
      return raw;
    }
    return mergeRolePermissions(defaults, raw);
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("El nombre del rol es requerido");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), permissions });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isNew ? "Crear nuevo rol" : `Editar: ${template.name}`}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </button>
          {canModify && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Nombre del rol
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canModify}
            placeholder="Ej: Supervisor de Operaciones"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Descripción
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canModify}
            placeholder="Breve descripción del rol"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
          />
        </div>
      </div>

      {/* Permissions matrix */}
      <PermissionEditor
        permissions={permissions}
        onChange={setPermissions}
        disabled={!canModify}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════

export function RoleTemplatesClient({ isOwner }: { isOwner: boolean }) {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/role-templates");
      const json = await res.json();
      if (json.success) {
        setTemplates(json.data);
      }
    } catch (err) {
      toast.error("Error al cargar roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSaveEdit = async (
    templateId: string,
    data: { name: string; description: string; permissions: RolePermissions },
  ) => {
    const res = await fetch(`/api/admin/role-templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || "Error al guardar");
      return;
    }
    toast.success("Rol actualizado correctamente");
    setEditingId(null);
    fetchTemplates();
  };

  const handleSaveNew = async (data: {
    name: string;
    description: string;
    permissions: RolePermissions;
  }) => {
    const res = await fetch("/api/admin/role-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || "Error al crear");
      return;
    }
    toast.success("Rol creado correctamente");
    setCreating(false);
    fetchTemplates();
  };

  const handleDuplicate = async (template: RoleTemplate) => {
    const res = await fetch("/api/admin/role-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${template.name} (copia)`,
        description: template.description,
        permissions: template.permissions,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || "Error al duplicar");
      return;
    }
    toast.success("Rol duplicado. Puedes editarlo ahora.");
    fetchTemplates();
  };

  const handleDelete = async (template: RoleTemplate) => {
    if (!confirm(`¿Eliminar el rol "${template.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    const res = await fetch(`/api/admin/role-templates/${template.id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error || "Error al eliminar");
      return;
    }
    toast.success("Rol eliminado");
    fetchTemplates();
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Edit mode ──
  if (editingId) {
    const template = templates.find((t) => t.id === editingId) ?? null;
    return (
      <RoleEditPanel
        template={template}
        isOwner={isOwner}
        onSave={(data) => handleSaveEdit(editingId, data)}
        onCancel={() => setEditingId(null)}
      />
    );
  }

  // ── Create mode ──
  if (creating) {
    return (
      <RoleEditPanel
        template={null}
        isOwner={isOwner}
        onSave={handleSaveNew}
        onCancel={() => setCreating(false)}
      />
    );
  }

  // ── List mode ──
  const systemTemplates = templates.filter((t) => t.isSystem);
  const customTemplates = templates.filter((t) => !t.isSystem);

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} rol{templates.length !== 1 ? "es" : ""} configurado
          {templates.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Crear rol
        </button>
      </div>

      {/* System roles */}
      {systemTemplates.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Roles de sistema
          </h3>
          <div className="grid gap-3">
            {systemTemplates.map((t) => (
              <RoleTemplateCard
                key={t.id}
                template={t}
                isOwner={isOwner}
                onEdit={() => setEditingId(t.id)}
                onDuplicate={() => handleDuplicate(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Custom roles */}
      {customTemplates.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Roles personalizados
          </h3>
          <div className="grid gap-3">
            {customTemplates.map((t) => (
              <RoleTemplateCard
                key={t.id}
                template={t}
                isOwner={isOwner}
                onEdit={() => setEditingId(t.id)}
                onDuplicate={() => handleDuplicate(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty custom */}
      {customTemplates.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-accent/20 p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No hay roles personalizados
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Crea un rol nuevo o duplica uno existente para personalizar los permisos
          </p>
        </div>
      )}
    </div>
  );
}
