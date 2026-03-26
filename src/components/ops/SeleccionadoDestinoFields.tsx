"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type InstallationApiRow = {
  id: string;
  name: string;
  account?: { id: string; name: string } | null;
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : String(iso);
  return s.slice(0, 10);
}

function buildOptions(
  rows: InstallationApiRow[],
  current?: { id: string; name: string; account?: { name?: string | null } | null } | null
): SearchableOption[] {
  const map = new Map<string, SearchableOption>();
  for (const i of rows) {
    const client = i.account?.name?.trim() || "Sin cliente";
    const searchText = `${client} ${i.name}`.toLowerCase();
    map.set(i.id, {
      id: i.id,
      label: i.name,
      description: client,
      searchText,
    });
  }
  if (current?.id && !map.has(current.id)) {
    const client = current.account?.name?.trim() || "Cliente";
    map.set(current.id, {
      id: current.id,
      label: current.name,
      description: client,
      searchText: `${client} ${current.name}`.toLowerCase(),
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const da = a.description || "";
    const db = b.description || "";
    if (da !== db) return da.localeCompare(db, "es");
    return a.label.localeCompare(b.label, "es");
  });
}

export type SeleccionadoDestinoFieldsProps = {
  guardiaId: string;
  lifecycleStatus: string;
  intendedInstallationId: string | null | undefined;
  intendedContractDate: string | null | undefined;
  intendedInstallation?: {
    id: string;
    name: string;
    account?: { id?: string; name?: string | null } | null;
  } | null;
  canEdit: boolean;
  compact?: boolean;
  className?: string;
  onUpdated: (patch: {
    intendedInstallationId?: string | null;
    intendedContractDate?: string | null;
    intendedInstallation?: SeleccionadoDestinoFieldsProps["intendedInstallation"];
  }) => void;
};

export function SeleccionadoDestinoFields({
  guardiaId,
  lifecycleStatus,
  intendedInstallationId,
  intendedContractDate,
  intendedInstallation,
  canEdit,
  compact,
  className,
  onUpdated,
}: SeleccionadoDestinoFieldsProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [installations, setInstallations] = useState<InstallationApiRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/instalaciones", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setInstallations(data.data);
      } else {
        setInstallations([]);
      }
    } catch {
      setInstallations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(
    () => buildOptions(installations, intendedInstallation),
    [installations, intendedInstallation]
  );

  const valueId = intendedInstallationId ?? "";

  const patch = useCallback(
    async (body: Record<string, string | null>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/personas/guardias/${guardiaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error(data.error || "No se pudo guardar");
          return;
        }
        const g = data.data as {
          intendedInstallationId?: string | null;
          intendedContractDate?: Date | string | null;
          intendedInstallation?: SeleccionadoDestinoFieldsProps["intendedInstallation"];
        };
        onUpdated({
          intendedInstallationId: g.intendedInstallationId ?? null,
          intendedContractDate: g.intendedContractDate
            ? typeof g.intendedContractDate === "string"
              ? g.intendedContractDate
              : g.intendedContractDate.toISOString?.() ?? null
            : null,
          intendedInstallation: g.intendedInstallation ?? undefined,
        });
      } catch {
        toast.error("Error de conexión");
      } finally {
        setSaving(false);
      }
    },
    [guardiaId, onUpdated]
  );

  const show =
    lifecycleStatus === "seleccionado" ||
    (intendedInstallationId || intendedContractDate);

  if (!show) return null;

  const dateVal = toDateInputValue(intendedContractDate ?? undefined);

  const disabled = !canEdit || saving || lifecycleStatus !== "seleccionado";

  return (
    <div
      className={cn(
        "rounded-md border border-border/80 bg-muted/20 p-2 space-y-2",
        compact && "p-1.5 space-y-1.5",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        <span>Plan selección</span>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {loading && !installations.length && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] text-muted-foreground">Instalación prevista</Label>
          <SearchableSelect
            value={valueId}
            options={options}
            placeholder={loading ? "Cargando…" : "Buscar cliente o instalación…"}
            emptyText="Sin instalaciones activas"
            disabled={disabled || loading}
            dropdownInPortal
            onChange={(id) => {
              void patch({ intendedInstallationId: id || null });
            }}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Fecha probable contratación
          </Label>
          <input
            type="date"
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              disabled && "opacity-60 pointer-events-none"
            )}
            value={dateVal}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              void patch({ intendedContractDate: v || null });
            }}
          />
        </div>
      </div>
      {lifecycleStatus !== "seleccionado" && (intendedInstallationId || intendedContractDate) && (
        <p className="text-[10px] text-muted-foreground">
          Solo editable en fase «Seleccionado». Los datos se conservan al cambiar de fase.
        </p>
      )}
    </div>
  );
}

/** Texto compacto para tarjetas / listas (solo lectura) */
export function SeleccionadoDestinoSummary({
  intendedInstallation,
  intendedContractDate,
}: {
  intendedInstallation?: { name: string; account?: { name?: string | null } | null } | null;
  intendedContractDate?: string | null;
}) {
  const parts: string[] = [];
  if (intendedInstallation?.name) {
    const c = intendedInstallation.account?.name?.trim();
    parts.push(c ? `${c} · ${intendedInstallation.name}` : intendedInstallation.name);
  }
  const d = toDateInputValue(intendedContractDate ?? undefined);
  if (d) {
    try {
      parts.push(
        new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(`${d}T12:00:00`)
        )
      );
    } catch {
      parts.push(d);
    }
  }
  if (parts.length === 0) return null;
  return <span className="text-[11px] text-muted-foreground">{parts.join(" · ")}</span>;
}
