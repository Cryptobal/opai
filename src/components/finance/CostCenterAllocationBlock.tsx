"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Search, X } from "lucide-react";
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
import { EmptyState, SegmentedControl, Surface, Tag } from "@/components/opai-ds";
import {
  splitAmountByWeights,
  uniqueInstallationIds,
  type CostAllocationDriver,
  type CostCenterAssignment,
  type CostCenterPolicy,
} from "@/modules/finance/banking/cost-allocation-math";
import { CostCenterSplitPreview } from "./CostCenterSplitPreview";

export type AllocationInstallOption = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  commune: string | null;
  activeGuards: number;
  requiredGuards: number;
};

export type { CostCenterAssignment, CostCenterPolicy, CostAllocationDriver };

const MODE_ITEMS = [
  { id: "NONE" as const, label: "Sin centro" },
  { id: "SINGLE" as const, label: "Una instalación" },
  { id: "SPLIT" as const, label: "Repartir" },
];

const DRIVER_ITEMS: Array<{ id: CostAllocationDriver; label: string }> = [
  { id: "ACTIVE_GUARDS", label: "Guardias activos" },
  { id: "EQUAL", label: "Partes iguales" },
  { id: "MANUAL", label: "Montos manuales" },
];

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function isCostCenterAssignmentReady(
  value: CostCenterAssignment,
  txAmountAbs: number,
): boolean {
  if (value.mode === "NONE") return true;
  if (value.mode === "SINGLE") return Boolean(value.installationId);
  if (value.installations.length === 0) return false;
  if (value.driver === "MANUAL") {
    const sum = value.installations.reduce(
      (s, i) => s + Math.round(i.amount ?? 0),
      0,
    );
    return sum === Math.round(txAmountAbs);
  }
  return true;
}

export function CostCenterAllocationBlock({
  txAmountAbs,
  isIncome,
  accountPolicy,
  value,
  onChange,
  defaultInstallationId,
}: {
  txAmountAbs: number;
  isIncome: boolean;
  accountPolicy?: CostCenterPolicy | null;
  value: CostCenterAssignment;
  onChange: (next: CostCenterAssignment) => void;
  defaultInstallationId?: string | null;
}) {
  const [installations, setInstallations] = useState<AllocationInstallOption[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);

  const needsList = value.mode === "SINGLE" || value.mode === "SPLIT";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: "all" });
      if (defaultInstallationId) params.append("includeId", defaultInstallationId);
      const res = await fetch(
        `/api/finance/banking/cost-allocation/installations?${params}`,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "No se pudieron cargar las instalaciones");
      }
      const list = Array.isArray(json.data) ? json.data : [];
      setInstallations(list as AllocationInstallOption[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar instalaciones");
    } finally {
      setLoading(false);
    }
  }, [defaultInstallationId]);

  useEffect(() => {
    if (needsList) void load();
  }, [needsList, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return installations.filter((i) => {
      if (!needle) return true;
      return (
        i.name.toLowerCase().includes(needle) ||
        (i.accountName ?? "").toLowerCase().includes(needle) ||
        (i.commune ?? "").toLowerCase().includes(needle)
      );
    });
  }, [installations, q]);

  const selectedIds = useMemo(() => {
    if (value.mode === "SINGLE") return value.installationId ? [value.installationId] : [];
    if (value.mode === "SPLIT") {
      return uniqueInstallationIds(value.installations.map((i) => i.installationId));
    }
    return [];
  }, [value]);

  const byId = useMemo(
    () => new Map(installations.map((i) => [i.id, i])),
    [installations],
  );

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of installations) {
      if (i.accountId && i.accountName) map.set(i.accountId, i.accountName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [installations]);

  const preview = useMemo(() => {
    if (value.mode !== "SPLIT" || selectedIds.length === 0) {
      return { rows: [] as ReturnType<typeof splitAmountByWeights>, excluded: [] as string[] };
    }
    if (value.driver === "MANUAL") {
      return {
        rows: value.installations
          .filter((i) => (i.amount ?? 0) > 0)
          .map((i) => ({ installationId: i.installationId, amount: Math.round(i.amount ?? 0) })),
        excluded: [] as string[],
      };
    }
    const weights = selectedIds.map((id) => {
      const inst = byId.get(id);
      if (value.driver === "EQUAL") {
        return { installationId: id, weight: 1, driverValue: null as number | null };
      }
      const active = inst?.activeGuards ?? 0;
      const required = inst?.requiredGuards ?? 0;
      const driverValue =
        value.driver === "REQUIRED_GUARDS" ? required : active || required;
      return { installationId: id, weight: driverValue, driverValue };
    });
    const excluded = weights.filter((w) => w.weight <= 0).map((w) => w.installationId);
    const positive = weights.filter((w) => w.weight > 0);
    return {
      rows: splitAmountByWeights(Math.round(txAmountAbs), positive),
      excluded,
    };
  }, [value, selectedIds, byId, txAmountAbs]);

  const splitSum = preview.rows.reduce((s, r) => s + r.amount, 0);
  const delta = Math.round(txAmountAbs) - splitSum;
  const splitReady =
    value.mode !== "SPLIT" ||
    (selectedIds.length > 0 &&
      preview.excluded.length < selectedIds.length &&
      (value.driver === "MANUAL" ? delta === 0 : preview.rows.length > 0 && delta === 0));

  const setMode = (mode: CostCenterAssignment["mode"]) => {
    if (mode === "NONE") onChange({ mode: "NONE" });
    else if (mode === "SINGLE") {
      onChange({
        mode: "SINGLE",
        installationId: defaultInstallationId || "",
      });
    } else {
      onChange({ mode: "SPLIT", driver: "ACTIVE_GUARDS", installations: [] });
    }
  };

  const addInstallations = (ids: string[]) => {
    const merged = uniqueInstallationIds([...selectedIds, ...ids]);
    if (value.mode === "SINGLE") {
      onChange({ mode: "SINGLE", installationId: merged[0] ?? "" });
      return;
    }
    if (value.mode !== "SPLIT") return;
    const prev = new Map(value.installations.map((i) => [i.installationId, i]));
    onChange({
      ...value,
      installations: merged.map((id) => prev.get(id) ?? { installationId: id }),
    });
  };

  const removeInstallation = (id: string) => {
    if (value.mode === "SINGLE") onChange({ mode: "SINGLE", installationId: "" });
    if (value.mode !== "SPLIT") return;
    onChange({
      ...value,
      installations: value.installations.filter((i) => i.installationId !== id),
    });
  };

  return (
    <div
      className="space-y-3"
      data-testid="cost-center-allocation-block"
      data-policy={accountPolicy ?? "OPTIONAL"}
    >
      <div className="space-y-1.5">
        <Label>Centro de costo</Label>
        <SegmentedControl
          items={MODE_ITEMS}
          value={value.mode}
          onChange={setMode}
          size="sm"
          ariaLabel="Destino del centro de costo"
        />
        {isIncome && value.mode === "NONE" && (
          <p className="text-[12px] text-ds-text-3">
            Los ingresos suelen quedar sin centro de costo (van por DTE / fila de flujo).
          </p>
        )}
      </div>

      {value.mode === "SINGLE" && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar instalación o cliente…"
              className="h-10 sm:h-9 pl-8"
              data-testid="cost-center-install-search"
            />
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-ds-text-3 py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando instalaciones…
            </div>
          )}
          {error && (
            <p className="text-[13px] text-status-danger-fg">{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No hay instalaciones activas"
              description="Activá una instalación o asigná el gasto sin centro de costo."
              compact
            />
          )}
          {!loading && filtered.length > 0 && (
            <ul className="max-h-48 overflow-y-auto space-y-1 ds-list-cascade">
              {Object.entries(groupByAccount(filtered)).map(([account, rows]) => (
                <li key={account}>
                  <p className="text-[12px] uppercase tracking-wide text-ds-text-3 px-1 py-1">
                    {account}
                  </p>
                  {rows.map((inst) => {
                    const selected = inst.id === value.installationId;
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() =>
                          onChange({ mode: "SINGLE", installationId: inst.id })
                        }
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] min-h-[44px] sm:min-h-0 ${
                          selected
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-ds-surface-2 text-ds-text-1"
                        }`}
                        data-testid={`cost-center-install-${inst.id}`}
                      >
                        <span className="truncate">{inst.name}</span>
                        <span className="shrink-0 text-[12px] text-ds-text-3 font-mono">
                          {inst.activeGuards} g.
                        </span>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {value.mode === "SPLIT" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 sm:h-9"
              onClick={() => addInstallations(installations.map((i) => i.id))}
              data-testid="cost-center-all-active"
            >
              Todas las activas
            </Button>
            {accounts.length > 0 && (
              <Select
                onValueChange={(v) => {
                  const ofAccount = installations
                    .filter((i) => i.accountId === v)
                    .map((i) => i.id);
                  addInstallations(ofAccount);
                }}
              >
                <SelectTrigger className="h-10 sm:h-9" data-testid="cost-center-by-account">
                  <SelectValue placeholder="Todas las de un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      Todas las de {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Agregar instalación…"
              className="h-10 sm:h-9 pl-8"
            />
          </div>
          {q.trim() && (
            <ul className="max-h-36 overflow-y-auto space-y-1">
              {filtered
                .filter((i) => !selectedIds.includes(i.id))
                .slice(0, 20)
                .map((inst) => (
                  <li key={inst.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[13px] min-h-[44px] hover:bg-ds-surface-2"
                      onClick={() => {
                        addInstallations([inst.id]);
                        setQ("");
                      }}
                    >
                      <span className="truncate">
                        {inst.name}
                        {inst.accountName ? ` · ${inst.accountName}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const inst = byId.get(id);
                return (
                  <Tag key={id} size="md" variant="neutral">
                    <span className="truncate max-w-[160px]">
                      {inst?.name ?? id.slice(0, 8)}
                    </span>
                    <button
                      type="button"
                      className="ml-1 inline-flex h-6 w-6 items-center justify-center"
                      onClick={() => removeInstallation(id)}
                      aria-label="Quitar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Tag>
                );
              })}
            </div>
          )}
          <Select
            value={value.driver}
            onValueChange={(d) =>
              onChange({ ...value, driver: d as CostAllocationDriver })
            }
          >
            <SelectTrigger className="h-10 sm:h-9" data-testid="cost-center-driver">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRIVER_ITEMS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando reparto…
            </div>
          )}
          {error && <p className="text-[13px] text-status-danger-fg">{error}</p>}
          {!loading && installations.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No hay instalaciones activas"
              compact
            />
          )}
          {preview.excluded.length > 0 && (
            <p className="text-[12px] text-status-warn-fg">
              {preview.excluded.length} instalación
              {preview.excluded.length === 1 ? "" : "es"} sin dotación, excluida
              {preview.excluded.length === 1 ? "" : "s"} del reparto.
            </p>
          )}
          {selectedIds.length > 0 && preview.excluded.length === selectedIds.length && (
            <p className="text-[13px] text-status-danger-fg">
              Ninguna instalación seleccionada tiene dotación; elegí partes iguales o asigná manualmente.
            </p>
          )}
          {selectedIds.length > 30 && !expanded ? (
            <Surface elevation={1} padding="sm" className="space-y-2">
              <p className="text-[13px] text-ds-text-2">
                {selectedIds.length} instalaciones · total {fmtCLP.format(splitSum)}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="h-10 sm:h-9"
                onClick={() => setExpanded(true)}
              >
                Ver detalle
              </Button>
            </Surface>
          ) : (
            <CostCenterSplitPreview
              rows={preview.rows.map((r) => {
                const inst = byId.get(r.installationId);
                const instGuards =
                  value.driver === "EQUAL"
                    ? null
                    : (inst?.activeGuards || inst?.requiredGuards || 0);
                const total = Math.round(txAmountAbs) || 1;
                return {
                  installationId: r.installationId,
                  name: inst?.name ?? r.installationId.slice(0, 8),
                  accountName: inst?.accountName ?? null,
                  guards: instGuards,
                  pct: r.amount / total,
                  amount: r.amount,
                };
              })}
              driver={value.driver}
              onAmountChange={
                value.driver === "MANUAL"
                  ? (installationId, amount) => {
                      onChange({
                        ...value,
                        installations: value.installations.map((i) =>
                          i.installationId === installationId
                            ? { ...i, amount }
                            : i,
                        ),
                      });
                    }
                  : undefined
              }
            />
          )}
          {value.mode === "SPLIT" && selectedIds.length > 0 && !splitReady && (
            <p className="text-[13px] font-medium text-status-danger-fg" data-testid="cost-center-unbalanced">
              {delta > 0
                ? `Faltan ${fmtCLP.format(delta)} para cuadrar`
                : `Sobran ${fmtCLP.format(Math.abs(delta))}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function groupByAccount(
  rows: AllocationInstallOption[],
): Record<string, AllocationInstallOption[]> {
  const out: Record<string, AllocationInstallOption[]> = {};
  for (const r of rows) {
    const key = r.accountName ?? "Sin cliente";
    (out[key] ??= []).push(r);
  }
  return out;
}
