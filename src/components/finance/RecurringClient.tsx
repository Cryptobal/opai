"use client";

/**
 * RecurringClient — gestión inline de plantillas recurrentes (vive
 * embebido dentro de la pestaña "Programación" de Facturación). Lista
 * + acciones (crear, editar, generar borrador ahora, pausar/activar,
 * eliminar) + buscador global + filtros (estado, frecuencia, cliente,
 * instalación).
 *
 * Auto-loading: si recibe `initialTemplates` los usa como render
 * inicial pero igual hace su propio refetch para mantener la lista
 * fresca después de mutaciones del modal de create/edit.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Plus,
  Pencil,
  Search,
  X,
  Building2,
  MapPin,
  FileText,
  FilterX,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RecurringTemplateForm } from "./RecurringTemplateForm";

const DTE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  weekly: "Semanal",
  yearly: "Anual",
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export type RecurringTemplateRow = {
  id: string;
  name: string;
  isActive: boolean;
  dteType: number;
  receiverName: string;
  receiverRut: string;
  currency: string;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  ufFixingPolicy?: string;
  ufFixingDay?: number | null;
  /** Cliente CRM asociado (enriquecido en GET, null si es manual). */
  crmAccount?: {
    id: string;
    name: string;
    legalName: string | null;
    rut: string | null;
  } | null;
  /** Instalación asociada (enriquecida en GET). */
  installation?: {
    id: string;
    name: string;
    commune: string | null;
  } | null;
};

const UF_POLICY_LABEL: Record<string, string> = {
  RUN_DAY: "UF: día de ejecución",
  LAST_DAY_PREV_MONTH: "UF: fin del mes anterior",
  FIRST_DAY_MONTH: "UF: 1° del mes",
  LAST_DAY_MONTH: "UF: fin del mes",
  CUSTOM_DAY: "UF: día específico",
};

function formatFrequency(t: RecurringTemplateRow): string {
  const base = FREQ_LABELS[t.frequency] ?? t.frequency;
  if (t.frequency === "monthly") {
    if (t.dayOfMonth === -1) return `${base} · último día`;
    return `${base} · día ${t.dayOfMonth ?? 1}`;
  }
  if (t.frequency === "weekly" || t.frequency === "biweekly") {
    return `${base} · ${DOW_LABELS[t.dayOfWeek ?? 1]}`;
  }
  if (t.frequency === "yearly") {
    return `${base} · ${t.monthOfYear ?? 1}/${t.dayOfMonth ?? 1}`;
  }
  return base;
}

interface Props {
  initialTemplates?: RecurringTemplateRow[];
  canManage: boolean;
  /** Callback opcional cuando la lista cambia (para sincronizar parents). */
  onChange?: (next: RecurringTemplateRow[]) => void;
}

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED";
type FreqFilter = "ALL" | "monthly" | "biweekly" | "weekly" | "yearly";

export function RecurringClient({
  initialTemplates = [],
  canManage,
  onChange,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<RecurringTemplateRow[]>(initialTemplates);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [reloading, setReloading] = React.useState(false);
  // Modal: null = cerrado, "" = crear nueva, "<id>" = editar existente
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // ── Filtros + buscador ──
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");
  const [freqFilter, setFreqFilter] = React.useState<FreqFilter>("ALL");
  const [accountFilter, setAccountFilter] = React.useState<string>("ALL");
  const [installationFilter, setInstallationFilter] = React.useState<string>("ALL");

  const reload = React.useCallback(async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/finance/billing/recurring");
      const j = await res.json();
      if (j?.success) {
        const next = (j.data?.templates ?? []) as RecurringTemplateRow[];
        setTemplates(next);
        onChange?.(next);
      }
    } finally {
      setReloading(false);
    }
  }, [onChange]);

  React.useEffect(() => {
    // Refetch on mount para mantener la lista al día (initialTemplates
    // puede venir staleada del SSR del padre).
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunNow = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}/run-now`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Error al generar borrador");
      const status = j.data?.status;
      if (status === "success") {
        toast.success(
          "Borrador generado desde la plantilla. Lo encontrás en \"DTEs Emitidos\" con el badge \"Borrador\".",
        );
      } else if (status === "failed") {
        toast.error(j.data?.error || "Falla al generar borrador");
      } else {
        toast.info(`Saltado (${status})`);
      }
      await reload();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (t: RecurringTemplateRow) => {
    setBusyId(t.id);
    try {
      // Necesitamos el shape full para PATCH (validación strict en backend).
      const fullRes = await fetch(`/api/finance/billing/recurring/${t.id}`);
      const fullJson = await fullRes.json();
      if (!fullRes.ok) throw new Error(fullJson.error || "Error");
      const full = fullJson.data;
      const res = await fetch(`/api/finance/billing/recurring/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...full,
          isActive: !t.isActive,
          startDate: full.startDate.split("T")[0],
          endDate: full.endDate ? full.endDate.split("T")[0] : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al actualizar");
      }
      toast.success(t.isActive ? "Plantilla pausada" : "Plantilla activada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Las corridas históricas se mantienen.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/billing/recurring/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Error al eliminar");
      }
      toast.success("Plantilla eliminada");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusyId(null);
    }
  };

  const totalActive = templates.filter((t) => t.isActive).length;

  // ── Opciones únicas de cliente / instalación para los selects ──
  const accountOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) {
      if (t.crmAccount) {
        map.set(t.crmAccount.id, t.crmAccount.legalName ?? t.crmAccount.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [templates]);

  const installationOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) {
      if (t.installation) {
        map.set(t.installation.id, t.installation.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [templates]);

  // ── Filtrado en cliente ──
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter === "ACTIVE" && !t.isActive) return false;
      if (statusFilter === "PAUSED" && t.isActive) return false;
      if (freqFilter !== "ALL" && t.frequency !== freqFilter) return false;
      if (accountFilter !== "ALL" && t.crmAccount?.id !== accountFilter) {
        return false;
      }
      if (
        installationFilter !== "ALL" &&
        t.installation?.id !== installationFilter
      ) {
        return false;
      }
      if (!q) return true;
      // Buscador global: nombre, RUT, cliente CRM, instalación.
      const hay =
        t.name.toLowerCase().includes(q) ||
        t.receiverName.toLowerCase().includes(q) ||
        (t.receiverRut ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.name ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.legalName ?? "").toLowerCase().includes(q) ||
        (t.crmAccount?.rut ?? "").toLowerCase().includes(q) ||
        (t.installation?.name ?? "").toLowerCase().includes(q) ||
        (t.installation?.commune ?? "").toLowerCase().includes(q);
      return hay;
    });
  }, [templates, search, statusFilter, freqFilter, accountFilter, installationFilter]);

  const hasActiveFilters =
    !!search.trim() ||
    statusFilter !== "ALL" ||
    freqFilter !== "ALL" ||
    accountFilter !== "ALL" ||
    installationFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setFreqFilter("ALL");
    setAccountFilter("ALL");
    setInstallationFilter("ALL");
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {templates.length === 0
              ? "Aún no hay plantillas."
              : `${totalActive} activa${totalActive === 1 ? "" : "s"} · ${templates.length} total${templates.length === 1 ? "" : "es"}${
                  hasActiveFilters
                    ? ` · ${filtered.length} mostrad${filtered.length === 1 ? "a" : "as"}`
                    : ""
                }`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={reloading}
              className="h-10 sm:h-9"
            >
              {reloading ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="size-4 mr-1.5" />
              )}
              Actualizar
            </Button>
            {canManage && (
              <Button
                size="sm"
                onClick={() => setEditingId("")}
                className="h-10 sm:h-9"
              >
                <Plus className="size-4 mr-1.5" />
                Nueva plantilla
              </Button>
            )}
          </div>
        </div>

        {/* Buscador global + filtros */}
        {templates.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-3 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, cliente, RUT o instalación…"
                  className="h-10 sm:h-9 pl-9 pr-9"
                  autoComplete="off"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ds-text-3 hover:bg-ds-surface-2"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-10 sm:h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="ACTIVE">Activas</SelectItem>
                  <SelectItem value="PAUSED">Pausadas</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={freqFilter}
                onValueChange={(v) => setFreqFilter(v as FreqFilter)}
              >
                <SelectTrigger className="h-10 sm:h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toda frecuencia</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="biweekly">Quincenal</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
              {accountOptions.length > 0 && (
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-10 sm:h-9 w-[180px]">
                    <SelectValue placeholder="Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los clientes</SelectItem>
                    {accountOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {installationOptions.length > 0 && (
                <Select
                  value={installationFilter}
                  onValueChange={setInstallationFilter}
                >
                  <SelectTrigger className="h-10 sm:h-9 w-[180px]">
                    <SelectValue placeholder="Instalación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las instalaciones</SelectItem>
                    {installationOptions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-10 sm:h-9 text-ds-text-3"
                >
                  <FilterX className="size-4 mr-1.5" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No hay plantillas recurrentes. Creá una para que el cron diario
            te genere borradores automáticamente.
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Ninguna plantilla coincide con los filtros actuales.
            <button
              type="button"
              onClick={clearFilters}
              className="block mx-auto mt-2 text-primary hover:underline font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            {/* Mobile: lista de cards */}
            <div className="sm:hidden space-y-2">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.name}</div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {t.receiverName} · {t.receiverRut}
                      </div>
                      {(t.crmAccount || t.installation) && (
                        <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-ds-text-3">
                          {t.crmAccount && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                CRM: {t.crmAccount.legalName ?? t.crmAccount.name}
                              </span>
                            </span>
                          )}
                          {t.installation && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {t.installation.name}
                                {t.installation.commune
                                  ? ` · ${t.installation.commune}`
                                  : ""}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-[12px] text-muted-foreground mt-0.5">
                        {DTE_LABELS[t.dteType] ?? `Tipo ${t.dteType}`} · {t.currency}
                        {t.currency === "UF" && t.ufFixingPolicy && (
                          <span className="block">
                            {t.ufFixingPolicy === "CUSTOM_DAY"
                              ? `UF: día ${t.ufFixingDay ?? "?"}`
                              : (UF_POLICY_LABEL[t.ufFixingPolicy] ?? t.ufFixingPolicy)}
                          </span>
                        )}
                      </div>
                    </div>
                    {t.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-status-ok-soft text-status-ok-fg border border-status-ok-border text-[12px]">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ds-surface-3 text-ds-text-3 border border-ds-border-subtle text-[12px]">
                        Pausada
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px] text-muted-foreground">
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                        Frecuencia
                      </span>
                      <span>{formatFrequency(t)}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                        Próxima
                      </span>
                      <span>
                        {t.nextRunAt
                          ? new Date(t.nextRunAt).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                        Última
                      </span>
                      <span>
                        {t.lastRunAt
                          ? new Date(t.lastRunAt).toLocaleDateString("es-CL")
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                        Corridas
                      </span>
                      <span>{t.runCount}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap justify-end gap-1.5 pt-1 border-t border-border/60">
                      <Button
                        size="sm"
                        onClick={() => handleRunNow(t.id)}
                        disabled={busyId === t.id || !t.isActive}
                        className="h-10 sm:h-9"
                        title="Genera un borrador con los datos de la plantilla"
                      >
                        {busyId === t.id ? (
                          <Loader2 className="size-4 mr-1.5 animate-spin" />
                        ) : (
                          <FileText className="size-4 mr-1.5" />
                        )}
                        Generar borrador
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(t.id)}
                        disabled={busyId === t.id}
                        className="h-10 sm:h-9"
                      >
                        <Pencil className="size-4 mr-1.5" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(t)}
                        disabled={busyId === t.id}
                        className="h-10 sm:h-9"
                      >
                        {t.isActive ? (
                          <Pause className="size-4 mr-1.5" />
                        ) : (
                          <Play className="size-4 mr-1.5" />
                        )}
                        {t.isActive ? "Pausar" : "Activar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(t.id)}
                        disabled={busyId === t.id}
                        className="h-10 sm:h-9"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Plantilla</th>
                    <th className="py-2 text-left">Cliente / Instalación</th>
                    <th className="py-2 text-left">Tipo</th>
                    <th className="py-2 text-left">Frecuencia</th>
                    <th className="py-2 text-left">Próxima</th>
                    <th className="py-2 text-left">Última</th>
                    <th className="py-2 text-right">Corridas</th>
                    <th className="py-2 text-left">Estado</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/40">
                      <td className="py-2">
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.receiverName}
                          {t.receiverRut ? ` (${t.receiverRut})` : ""}
                        </div>
                      </td>
                      <td className="py-2 text-xs">
                        {t.crmAccount ? (
                          <div className="inline-flex items-center gap-1 text-ds-text-1">
                            <Building2 className="h-3 w-3 shrink-0 text-ds-text-3" />
                            <span className="truncate max-w-[180px]">
                              {t.crmAccount.legalName ?? t.crmAccount.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-ds-text-4 italic">Manual</span>
                        )}
                        {t.installation && (
                          <div className="inline-flex items-center gap-1 text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[180px]">
                              {t.installation.name}
                              {t.installation.commune
                                ? ` · ${t.installation.commune}`
                                : ""}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {DTE_LABELS[t.dteType] ?? `Tipo ${t.dteType}`}
                        <div className="text-xs text-muted-foreground">
                          {t.currency}
                          {t.currency === "UF" && t.ufFixingPolicy && (
                            <span className="block text-[12px]">
                              {t.ufFixingPolicy === "CUSTOM_DAY"
                                ? `UF: día ${t.ufFixingDay ?? "?"}`
                                : (UF_POLICY_LABEL[t.ufFixingPolicy] ?? t.ufFixingPolicy)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-xs">{formatFrequency(t)}</td>
                      <td className="py-2 text-xs">
                        {t.nextRunAt
                          ? new Date(t.nextRunAt).toLocaleDateString("es-CL")
                          : "—"}
                      </td>
                      <td className="py-2 text-xs">
                        {t.lastRunAt
                          ? new Date(t.lastRunAt).toLocaleDateString("es-CL")
                          : "—"}
                      </td>
                      <td className="py-2 text-right text-xs tabular-nums">{t.runCount}</td>
                      <td className="py-2 text-xs">
                        {t.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-status-ok-soft text-status-ok-fg border border-status-ok-border">
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ds-surface-3 text-ds-text-3 border border-ds-border-subtle">
                            Pausada
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1 items-center">
                          {canManage && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleRunNow(t.id)}
                                disabled={busyId === t.id || !t.isActive}
                                title={
                                  t.isActive
                                    ? "Genera un borrador con los datos de la plantilla (no emite al SII)"
                                    : "Activá la plantilla para poder generar borradores"
                                }
                                className="h-8"
                              >
                                {busyId === t.id ? (
                                  <Loader2 className="size-4 mr-1 animate-spin" />
                                ) : (
                                  <FileText className="size-4 mr-1" />
                                )}
                                <span className="hidden lg:inline">
                                  Generar borrador
                                </span>
                                <span className="lg:hidden">Borrador</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(t.id)}
                                disabled={busyId === t.id}
                                title="Editar plantilla"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleActive(t)}
                                disabled={busyId === t.id}
                                title={t.isActive ? "Pausar" : "Activar"}
                              >
                                {t.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(t.id)}
                                disabled={busyId === t.id}
                                title="Eliminar"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>

      <RecurringTemplateForm
        open={editingId !== null}
        templateId={editingId || null}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          reload();
          router.refresh();
        }}
      />
    </Card>
  );
}
