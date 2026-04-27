"use client";

/**
 * RoleTemplatesClient — Editor visual de roles y permisos.
 *
 * UI dividida en 3 tabs:
 *  1. Resumen        — métricas, diff vs preset, restaurar
 *  2. Permisos       — matriz buscable + filtrable + indicador de override
 *  3. Vista del rol  — preview en vivo del sidebar y /opai/configuracion
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
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
  getDefaultPermissions,
  mergeRolePermissions,
  diffPermissions,
  summarizePermissions,
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
  Search,
  Eye,
  Star,
  Minus,
  Check,
  AlertTriangle,
  RotateCcw,
  Play,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  notifyRolesUpdated,
  useRoleSimulation,
} from "@/contexts/RoleSimulationContext";

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
//  Permission Level visual config
// ═══════════════════════════════════════════

const LEVEL_VISUALS: Record<
  PermissionLevel,
  {
    label: string;
    icon: typeof Eye;
    color: string;
    bg: string;
    text: string;
    border: string;
    description: string;
  }
> = {
  none: {
    label: "Sin acceso",
    icon: Minus,
    color: "zinc",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400 dark:text-zinc-300",
    border: "border-zinc-500/30",
    description: "El rol no puede ver este módulo",
  },
  view: {
    label: "Visualizar",
    icon: Eye,
    color: "blue",
    bg: "bg-blue-500/10",
    text: "text-blue-500 dark:text-blue-300",
    border: "border-blue-500/30",
    description: "Solo lectura: ver pero no editar",
  },
  edit: {
    label: "Editar",
    icon: Pencil,
    color: "amber",
    bg: "bg-amber-500/10",
    text: "text-amber-500 dark:text-amber-300",
    border: "border-amber-500/30",
    description: "Crear y editar, pero no eliminar",
  },
  full: {
    label: "Completo",
    icon: Star,
    color: "emerald",
    bg: "bg-emerald-500/10",
    text: "text-emerald-500 dark:text-emerald-300",
    border: "border-emerald-500/30",
    description: "Crear, editar y eliminar",
  },
};

function PermissionLevelDropdown({
  level,
  onChange,
  disabled,
  inherited,
  size = "default",
}: {
  level: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
  inherited?: boolean;
  size?: "default" | "sm";
}) {
  const v = LEVEL_VISUALS[level];
  const Icon = v.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
            size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
            disabled && "opacity-50 cursor-not-allowed",
            inherited
              ? "bg-transparent text-muted-foreground border-dashed border-border/60 hover:bg-accent/30"
              : cn(v.bg, v.text, v.border, !disabled && "hover:opacity-90"),
          )}
          title={inherited ? `Heredado: ${v.label}` : v.description}
        >
          <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span className="whitespace-nowrap">
            {inherited ? `↳ ${v.label}` : v.label}
          </span>
          <ChevronDown className={cn("opacity-60", size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {PERMISSION_LEVELS.map((l) => {
          const lv = LEVEL_VISUALS[l];
          const LIcon = lv.icon;
          const isCurrent = !inherited && l === level;
          return (
            <DropdownMenuItem
              key={l}
              onClick={() => onChange(l)}
              className="gap-2 py-2"
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center h-5 w-5 rounded shrink-0 border",
                  lv.bg,
                  lv.text,
                  lv.border,
                )}
              >
                <LIcon className="h-3 w-3" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight">{lv.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {lv.description}
                </p>
              </div>
              {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ═══════════════════════════════════════════
//  Filter Chips
// ═══════════════════════════════════════════

type FilterMode = "all" | "with_access" | "no_access" | "modified";

const FILTER_LABELS: Record<FilterMode, string> = {
  all: "Todos",
  with_access: "Con acceso",
  no_access: "Sin acceso",
  modified: "Modificados",
};

function FilterChips({
  value,
  onChange,
  modifiedCount,
}: {
  value: FilterMode;
  onChange: (v: FilterMode) => void;
  modifiedCount: number;
}) {
  const opts: FilterMode[] = ["all", "with_access", "no_access", "modified"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map((opt) => {
        const isActive = value === opt;
        const showCounter = opt === "modified" && modifiedCount > 0;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:bg-accent/30",
            )}
          >
            {FILTER_LABELS[opt]}
            {showCounter && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[16px] h-4 rounded-full text-[10px] font-semibold px-1",
                isActive ? "bg-primary/20 text-primary" : "bg-amber-500/15 text-amber-500",
              )}>
                {modifiedCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════
//  Permission Editor (matriz buscable)
// ═══════════════════════════════════════════

function PermissionEditor({
  permissions,
  preset,
  onChange,
  disabled,
}: {
  permissions: RolePermissions;
  preset: RolePermissions;
  onChange: (perms: RolePermissions) => void;
  disabled?: boolean;
}) {
  const [expandedModules, setExpandedModules] = useState<Set<ModuleKey>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [confirmCascade, setConfirmCascade] = useState<{
    module: ModuleKey;
    nextLevel: PermissionLevel;
    overrideCount: number;
  } | null>(null);

  const diff = useMemo(() => diffPermissions(permissions, preset), [permissions, preset]);
  const modifiedCount = diff.total;

  // Conjunto rápido de claves modificadas
  const modifiedSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of diff.modules) s.add(`module:${m}`);
    for (const k of diff.submodules) s.add(`sub:${k}`);
    for (const c of diff.capabilities) s.add(`cap:${c}`);
    return s;
  }, [diff]);

  const toggleModule = (mod: ModuleKey) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const applyModuleLevel = useCallback(
    (mod: ModuleKey, level: PermissionLevel, clearOverrides: boolean) => {
      const next = { ...permissions, modules: { ...permissions.modules, [mod]: level } };
      if (clearOverrides) {
        const nextSubs = { ...next.submodules };
        const subs = SUBMODULE_KEYS[mod] as readonly string[];
        for (const s of subs) {
          delete nextSubs[`${mod}.${s}`];
        }
        next.submodules = nextSubs;
      }
      onChange(next);
    },
    [permissions, onChange],
  );

  const setModuleLevel = (mod: ModuleKey, level: PermissionLevel) => {
    const subs = SUBMODULE_KEYS[mod] as readonly string[];
    const overrideCount = subs.filter((s) => `${mod}.${s}` in permissions.submodules).length;
    if (overrideCount > 0) {
      // Pedir confirmación antes de borrar overrides
      setConfirmCascade({ module: mod, nextLevel: level, overrideCount });
      return;
    }
    applyModuleLevel(mod, level, false);
  };

  const setSubmoduleLevel = (mod: ModuleKey, sub: string, level: PermissionLevel) => {
    const parentLevel = permissions.modules[mod] ?? "none";
    const subKey = `${mod}.${sub}`;
    const next = {
      ...permissions,
      modules: { ...permissions.modules },
      submodules: { ...permissions.submodules },
    };

    if (level === parentLevel) {
      // Si vuelve a igualar al padre, eliminar el override
      delete next.submodules[subKey];
    } else {
      next.submodules[subKey] = level;
    }

    if (LEVEL_RANK[level] > LEVEL_RANK[parentLevel] && parentLevel === "none") {
      next.modules[mod] = "view";
      toast.info(`Se elevó "${MODULE_META.find((m) => m.key === mod)?.label}" a Visualizar`, {
        description: "Para que un submódulo tenga acceso, su módulo padre debe permitir al menos visualizar.",
      });
    }

    onChange(next);
  };

  const toggleCapability = (cap: CapabilityKey) => {
    onChange({
      ...permissions,
      capabilities: {
        ...permissions.capabilities,
        [cap]: !permissions.capabilities[cap],
      },
    });
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

  // ── Filtros + búsqueda ──
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  const passesFilter = (level: PermissionLevel, key: string) => {
    if (filter === "all") return true;
    if (filter === "with_access") return LEVEL_RANK[level] >= LEVEL_RANK.view;
    if (filter === "no_access") return level === "none";
    if (filter === "modified") return modifiedSet.has(key);
    return true;
  };

  // Auto-expandir módulos con resultados de búsqueda
  useEffect(() => {
    if (!q && filter === "all") return;
    const next = new Set<ModuleKey>();
    for (const mod of MODULE_META) {
      const moduleMatch = matches(mod.label);
      const subs = SUBMODULE_META.filter((s) => s.module === mod.key);
      const hasSubMatch = subs.some((s) => matches(s.label));
      const hasCapMatch = (capabilitiesByModule.get(mod.key) ?? []).some((c) =>
        matches(c.label) || matches(c.description),
      );
      if (moduleMatch || hasSubMatch || hasCapMatch) next.add(mod.key);
    }
    setExpandedModules(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter]);

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar permiso, módulo o capacidad…"
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterChips value={filter} onChange={setFilter} modifiedCount={modifiedCount} />
      </div>

      {/* Lista de módulos */}
      <div className="rounded-lg border border-border divide-y divide-border bg-card">
        {MODULE_META.map((mod) => {
          const isExpanded = expandedModules.has(mod.key);
          const moduleLevel = permissions.modules[mod.key] ?? "none";
          const subs = SUBMODULE_META.filter((s) => s.module === mod.key);
          const caps = capabilitiesByModule.get(mod.key) ?? [];
          const hasSubs = subs.length > 0;

          // ── Filtrado ──
          const moduleMatch = matches(mod.label);
          const visibleSubs = subs.filter((s) => {
            const eff = getEffectiveLevel(permissions, mod.key, s.submodule);
            return matches(s.label) && passesFilter(eff, `sub:${mod.key}.${s.submodule}`);
          });
          const visibleCaps = caps.filter(
            (c) =>
              (matches(c.label) || matches(c.description)) &&
              (filter !== "modified" || modifiedSet.has(`cap:${c.key}`)) &&
              (filter !== "with_access" || !!permissions.capabilities[c.key]) &&
              (filter !== "no_access" || !permissions.capabilities[c.key]),
          );
          const moduleVisible =
            (moduleMatch && passesFilter(moduleLevel, `module:${mod.key}`)) ||
            visibleSubs.length > 0 ||
            visibleCaps.length > 0;

          if (!moduleVisible) return null;

          const overrideCount = subs.filter(
            (s) => `${mod.key}.${s.submodule}` in permissions.submodules,
          ).length;
          const isModified = modifiedSet.has(`module:${mod.key}`) || overrideCount > 0;

          return (
            <div key={mod.key}>
              {/* Header del módulo */}
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-accent/20 transition-colors">
                {hasSubs ? (
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
                    {isModified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/10 text-amber-500 rounded-full px-1.5 py-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        modificado
                      </span>
                    )}
                    {overrideCount > 0 && (
                      <span className="text-[10px] font-medium bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                        {overrideCount} override{overrideCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {caps.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/70">
                        +{caps.length} capacidad{caps.length !== 1 ? "es" : ""}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="flex-1 text-sm font-medium pl-6">{mod.label}</span>
                )}
                <PermissionLevelDropdown
                  level={moduleLevel}
                  onChange={(l) => setModuleLevel(mod.key, l)}
                  disabled={disabled}
                />
              </div>

              {/* Submódulos + capacidades */}
              {isExpanded && (
                <div className="border-t border-border bg-accent/10">
                  {visibleSubs.map((sub) => {
                    const subKey = `${mod.key}.${sub.submodule}`;
                    const hasOverride = subKey in permissions.submodules;
                    const effectiveLevel = getEffectiveLevel(
                      permissions,
                      mod.key,
                      sub.submodule,
                    );
                    const isSubModified = modifiedSet.has(`sub:${subKey}`);
                    return (
                      <div
                        key={subKey}
                        className="flex items-center gap-2 pl-11 pr-4 py-2 border-t border-border/50 first:border-t-0 hover:bg-accent/20"
                      >
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {sub.label}
                        </span>
                        {isSubModified && (
                          <span className="text-[9px] font-medium text-amber-500 bg-amber-500/10 rounded px-1 py-0.5 shrink-0">
                            modif.
                          </span>
                        )}
                        <PermissionLevelDropdown
                          level={effectiveLevel}
                          onChange={(l) =>
                            setSubmoduleLevel(mod.key, sub.submodule, l)
                          }
                          disabled={disabled}
                          inherited={!hasOverride}
                          size="sm"
                        />
                      </div>
                    );
                  })}

                  {visibleCaps.length > 0 && (
                    <>
                      <div className="pl-11 pr-4 pt-2 pb-1 border-t border-border/50">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Capacidades especiales
                        </span>
                      </div>
                      {visibleCaps.map((cap) => {
                        const isOn = permissions.capabilities[cap.key] === true;
                        const isCapModified = modifiedSet.has(`cap:${cap.key}`);
                        return (
                          <label
                            key={cap.key}
                            className={cn(
                              "flex items-start gap-3 pl-11 pr-4 py-2 cursor-pointer transition-colors hover:bg-accent/30 border-t border-border/30",
                              disabled && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleCapability(cap.key)}
                              disabled={disabled}
                              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-tight flex items-center gap-1.5">
                                {cap.label}
                                {isCapModified && (
                                  <span className="text-[9px] font-medium text-amber-500 bg-amber-500/10 rounded px-1 py-0.5">
                                    modif.
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                {cap.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}

                  {visibleSubs.length === 0 && visibleCaps.length === 0 && (q || filter !== "all") && (
                    <p className="pl-11 pr-4 py-2 text-[11px] text-muted-foreground/60 italic">
                      Sin resultados con los filtros actuales
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Diálogo de cascada */}
      <Dialog
        open={!!confirmCascade}
        onOpenChange={(o) => !o && setConfirmCascade(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Cambio en cascada
            </DialogTitle>
            <DialogDescription>
              Vas a cambiar{" "}
              <strong className="text-foreground">
                {confirmCascade
                  ? MODULE_META.find((m) => m.key === confirmCascade.module)?.label
                  : ""}
              </strong>{" "}
              a <strong className="text-foreground">{confirmCascade ? LEVEL_LABELS[confirmCascade.nextLevel] : ""}</strong>.
              <br />
              Hay {confirmCascade?.overrideCount} override{confirmCascade && confirmCascade.overrideCount > 1 ? "s" : ""} en submódulos.
              ¿Qué prefieres hacer con ellos?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="font-medium mb-1">Mantener overrides</p>
              <p className="text-muted-foreground leading-snug">
                El módulo cambia, pero los submódulos con permiso explícito conservan su nivel.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="font-medium mb-1">Limpiar overrides</p>
              <p className="text-muted-foreground leading-snug">
                Todos los submódulos vuelven a heredar del módulo padre.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setConfirmCascade(null)}
              className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmCascade) return;
                applyModuleLevel(confirmCascade.module, confirmCascade.nextLevel, false);
                setConfirmCascade(null);
              }}
              className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Mantener overrides
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmCascade) return;
                applyModuleLevel(confirmCascade.module, confirmCascade.nextLevel, true);
                setConfirmCascade(null);
              }}
              className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Limpiar overrides
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Tab 1: Resumen
// ═══════════════════════════════════════════

function RoleSummaryTab({
  permissions,
  preset,
  hasPreset,
  onRestorePreset,
  onSimulate,
  canSimulate,
  disabled,
}: {
  permissions: RolePermissions;
  preset: RolePermissions;
  hasPreset: boolean;
  onRestorePreset: () => void;
  onSimulate?: () => void;
  canSimulate?: boolean;
  disabled?: boolean;
}) {
  const summary = useMemo(() => summarizePermissions(permissions), [permissions]);
  const diff = useMemo(() => diffPermissions(permissions, preset), [permissions, preset]);

  return (
    <div className="space-y-4">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Módulos"
          value={`${summary.accessibleModules}/${summary.totalModules}`}
          hint="con acceso"
        />
        <MetricCard
          label="Submódulos"
          value={`${summary.accessibleSubmodules}/${summary.totalSubmodules}`}
          hint="con acceso"
        />
        <MetricCard
          label="Capacidades"
          value={summary.capabilities}
          hint="activadas"
        />
        <MetricCard
          label="Cambios vs preset"
          value={hasPreset ? diff.total : "—"}
          hint={hasPreset ? "personalizaciones" : "rol custom"}
          highlight={hasPreset && diff.total > 0}
        />
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        {canSimulate && onSimulate && (
          <button
            type="button"
            onClick={onSimulate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 border border-amber-500/30 transition-colors"
          >
            <Play className="h-3 w-3" />
            Simular este rol
          </button>
        )}
        {hasPreset && diff.total > 0 && !disabled && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Vas a revertir ${diff.total} cambio${diff.total > 1 ? "s" : ""} y restaurar los permisos por defecto del rol. ¿Continuar?`,
                )
              ) {
                onRestorePreset();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border hover:bg-accent transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar preset
          </button>
        )}
      </div>

      {/* Tarjetas por módulo */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 px-1">
          Acceso por módulo
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {MODULE_META.map((mod) => {
            const level = permissions.modules[mod.key] ?? "none";
            const subs = SUBMODULE_META.filter((s) => s.module === mod.key);
            const accessibleSubs = subs.filter(
              (s) =>
                LEVEL_RANK[getEffectiveLevel(permissions, mod.key, s.submodule)] >=
                LEVEL_RANK.view,
            );
            const v = LEVEL_VISUALS[level];
            const Icon = v.icon;
            const pct = subs.length > 0 ? (accessibleSubs.length / subs.length) * 100 : level === "none" ? 0 : 100;

            return (
              <div
                key={mod.key}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  level === "none" ? "bg-muted/20 border-border/50" : "bg-card border-border",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center h-6 w-6 rounded shrink-0 border",
                      v.bg,
                      v.text,
                      v.border,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-sm font-medium flex-1 truncate">{mod.label}</span>
                  <span className={cn("text-[10px] font-semibold uppercase", v.text)}>
                    {v.label}
                  </span>
                </div>
                {subs.length > 0 && (
                  <>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          level === "none" ? "bg-muted-foreground/30" : v.bg.replace("/10", "/60"),
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                      {accessibleSubs.length} de {subs.length} submódulo{subs.length !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight ? "bg-amber-500/5 border-amber-500/30" : "bg-card border-border",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "text-xl font-semibold tracking-tight mt-0.5",
          highlight && "text-amber-500",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
//  Card del rol (listado)
// ═══════════════════════════════════════════

function RoleTemplateCard({
  template,
  isOwner,
  onEdit,
  onDuplicate,
  onDelete,
  onSimulate,
  canSimulate,
  isCurrentSimulation,
}: {
  template: RoleTemplate;
  isOwner: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSimulate: () => void;
  canSimulate: boolean;
  isCurrentSimulation: boolean;
}) {
  const canRemove = !template.isSystem && template.usersCount === 0;
  const summary = useMemo(() => summarizePermissions(template.permissions), [template.permissions]);
  const preset = useMemo(() => getDefaultPermissions(template.slug), [template.slug]);
  const hasPreset = useMemo(
    () => Object.keys(preset.modules).length > 0,
    [preset],
  );
  const diff = useMemo(
    () => (hasPreset ? diffPermissions(template.permissions, preset) : null),
    [hasPreset, template.permissions, preset],
  );

  // Top capacidades distintivas
  const activeCaps = useMemo(() => {
    return CAPABILITY_META.filter((c) => template.permissions.capabilities[c.key] === true);
  }, [template.permissions]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all hover:shadow-sm min-w-0 overflow-hidden",
        isCurrentSimulation
          ? "border-amber-500/40 ring-1 ring-amber-500/20"
          : "border-border",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
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
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold truncate">{template.name}</h3>
              {template.isSystem && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
                  <Lock className="h-2.5 w-2.5" />
                  Sistema
                </span>
              )}
              {diff && diff.total > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/10 text-amber-500 rounded-full px-2 py-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  modificado
                </span>
              )}
              {isCurrentSimulation && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5">
                  <Eye className="h-2.5 w-2.5" />
                  simulando
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
              {template.description || `Slug: ${template.slug}`}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground/80">
              <span>
                {summary.accessibleModules}/{summary.totalModules} módulos
              </span>
              <span>·</span>
              <span>
                {summary.accessibleSubmodules}/{summary.totalSubmodules} submódulos
              </span>
              <span>·</span>
              <span>{summary.capabilities} capacidades</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1">
            <Users className="h-3 w-3" />
            {template.usersCount}
          </span>
          {canSimulate && (
            <button
              onClick={onSimulate}
              className="p-1.5 rounded-md hover:bg-amber-500/10 transition-colors"
              title={isCurrentSimulation ? "Detener simulación" : "Simular este rol"}
            >
              {isCurrentSimulation ? (
                <Eye className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title={template.isSystem && template.slug === "owner" ? "Ver permisos" : "Editar"}
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

      {/* Chips: módulos con acceso */}
      <div className="flex flex-wrap gap-1.5 mt-3 min-w-0">
        {MODULE_META.filter((m) => m.key !== "hub").map((mod) => {
          const level = template.permissions.modules?.[mod.key] ?? "none";
          if (level === "none") return null;
          const v = LEVEL_VISUALS[level];
          const Icon = v.icon;
          return (
            <span
              key={mod.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
                v.bg,
                v.text,
                v.border,
              )}
            >
              <Icon className="h-2.5 w-2.5" />
              {mod.label}
            </span>
          );
        })}
        {activeCaps.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-border bg-muted/30 text-muted-foreground">
            <Sparkles className="h-2.5 w-2.5" />
            +{activeCaps.length} capacidad{activeCaps.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Edit/Create Panel (con tabs)
// ═══════════════════════════════════════════

function RoleEditPanel({
  template,
  isOwner,
  onSave,
  onCancel,
  onSimulate,
  canSimulate,
}: {
  template: RoleTemplate | null;
  isOwner: boolean;
  onSave: (data: {
    name: string;
    description: string;
    permissions: RolePermissions;
  }) => Promise<void>;
  onCancel: () => void;
  onSimulate?: (slug: string) => void;
  canSimulate?: boolean;
}) {
  const isNew = !template;
  const canModify =
    isNew || !template.isSystem || (template.slug === "admin" && isOwner);
  // Dueño bloqueado de edición de permisos (solo nombre/descripción)
  const isLockedOwner = !!template?.isSystem && template?.slug === "owner";

  const preset = useMemo<RolePermissions>(() => {
    if (!template) return { modules: {}, submodules: {}, capabilities: {} };
    return getDefaultPermissions(template.slug);
  }, [template]);

  const hasPreset = useMemo(
    () => Object.keys(preset.modules).length > 0,
    [preset],
  );

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [permissions, setPermissions] = useState<RolePermissions>(() => {
    if (!template) return { modules: {}, submodules: {}, capabilities: {} };
    const raw = template.permissions as RolePermissions;
    if (!hasPreset) return raw;
    return mergeRolePermissions(preset, raw);
  });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("permisos");

  // Si cambia el template (nuevo edit) sincroniza
  useEffect(() => {
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    if (!template) {
      setPermissions({ modules: {}, submodules: {}, capabilities: {} });
      return;
    }
    const raw = template.permissions as RolePermissions;
    setPermissions(hasPreset ? mergeRolePermissions(preset, raw) : raw);
  }, [template, preset, hasPreset]);

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

  const handleRestore = () => {
    setPermissions(preset);
    toast.success("Preset restaurado");
  };

  const handleSimulate = () => {
    if (template && onSimulate) onSimulate(template.slug);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ChevronRight className="h-3 w-3 rotate-180" />
            Volver a roles
          </button>
          <h2 className="text-lg font-semibold mt-1 truncate">
            {isNew ? "Crear nuevo rol" : `Editar: ${template.name}`}
          </h2>
        </div>
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
              Guardar cambios
            </button>
          )}
        </div>
      </div>

      {/* Datos básicos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">
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
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">
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

      {isLockedOwner && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500/90">
          El rol Propietario tiene acceso total y no se puede modificar.
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="permisos">Permisos</TabsTrigger>
          <TabsTrigger value="vista">Vista del rol</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen" className="space-y-2">
          <RoleSummaryTab
            permissions={permissions}
            preset={preset}
            hasPreset={hasPreset}
            onRestorePreset={handleRestore}
            onSimulate={canSimulate && template ? handleSimulate : undefined}
            canSimulate={canSimulate}
            disabled={!canModify || isLockedOwner}
          />
        </TabsContent>
        <TabsContent value="permisos" className="space-y-2">
          <PermissionEditor
            permissions={permissions}
            preset={hasPreset ? preset : permissions}
            onChange={setPermissions}
            disabled={!canModify || isLockedOwner}
          />
        </TabsContent>
        <TabsContent value="vista" className="space-y-2">
          <RolePreviewLazy
            permissions={permissions}
            slug={template?.slug ?? ""}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Lazy: evita pesar el chunk inicial (incluye buildNavItems con ~30 iconos)
const RolePreview = dynamic(
  () => import("@/components/opai/RolePreview").then((m) => m.RolePreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

function RolePreviewLazy({
  permissions,
  slug,
}: {
  permissions: RolePermissions;
  slug: string;
}) {
  const isAdminRole = slug === "owner" || slug === "admin";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Así verá este rol el sidebar y la pantalla de Configuración con los permisos actuales.
      </p>
      <RolePreview permissions={permissions} isAdminRole={isAdminRole} />
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

  const {
    canSimulate,
    simulatedRole,
    startSimulation,
    stopSimulation,
  } = useRoleSimulation();

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/role-templates");
      const json = await res.json();
      if (json.success) {
        setTemplates(json.data);
      }
    } catch {
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
    notifyRolesUpdated();
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
    notifyRolesUpdated();
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
    notifyRolesUpdated();
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
    notifyRolesUpdated();
    fetchTemplates();
  };

  const handleSimulate = (slug: string) => {
    if (!canSimulate) return;
    if (simulatedRole === slug) {
      stopSimulation();
      toast.info("Simulación detenida");
    } else {
      startSimulation(slug);
      toast.success(`Simulando rol "${slug}"`, {
        description: "Navega por el sidebar para ver qué tiene acceso este rol.",
      });
    }
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
        onSimulate={handleSimulate}
        canSimulate={canSimulate}
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
        canSimulate={false}
      />
    );
  }

  // ── List mode ──
  const systemTemplates = templates.filter((t) => t.isSystem);
  const customTemplates = templates.filter((t) => !t.isSystem);

  return (
    <div className="space-y-6 min-w-0">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {templates.length} rol{templates.length !== 1 ? "es" : ""} configurado
            {templates.length !== 1 ? "s" : ""}
          </p>
          {canSimulate && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Click en <Play className="inline h-2.5 w-2.5" /> para simular un rol y ver qué accesos tiene en vivo.
            </p>
          )}
        </div>
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
                onSimulate={() => handleSimulate(t.slug)}
                canSimulate={canSimulate}
                isCurrentSimulation={simulatedRole === t.slug}
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
                onSimulate={() => handleSimulate(t.slug)}
                canSimulate={canSimulate}
                isCurrentSimulation={simulatedRole === t.slug}
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
