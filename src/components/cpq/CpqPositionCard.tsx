/**
 * Puesto CPQ — mismo patrón que Lead: campos editables en línea, sin modal “Editar”.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWeekdaysShort, getShiftType, normalizeWeekdays, WEEKDAY_ORDER } from "@/components/cpq/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { useCpqCatalogs } from "@/lib/cpq/use-cpq-catalogs";
import type { CpqPosition } from "@/types/cpq";
import { Copy, Loader2, Moon, RefreshCw, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CpqPositionCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated?: () => void;
  readOnly?: boolean;
  salePriceMonthlyForPosition?: number;
  clientHourlyRate?: number;
  /** Moneda de visualización (igual que CRM / cotización) */
  displayCurrency?: string;
  ufValue?: number | null;
}

type PositionDraft = {
  puestoTrabajoId: string;
  cargoId: string;
  rolId: string;
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos: number;
  baseSalary: number;
  afpName: string;
  healthSystem: string;
  healthPlanPct: number;
};

function positionToDraft(p: CpqPosition): PositionDraft {
  return {
    puestoTrabajoId: p.puestoTrabajoId,
    cargoId: p.cargoId,
    rolId: p.rolId,
    weekdays: normalizeWeekdays(p.weekdays),
    startTime: p.startTime,
    endTime: p.endTime,
    numGuards: p.numGuards,
    numPuestos: p.numPuestos || 1,
    baseSalary: Number(p.baseSalary),
    afpName: p.afpName || "modelo",
    healthSystem: p.healthSystem || "fonasa",
    healthPlanPct: p.healthPlanPct ?? 0.07,
  };
}

const HOURS_24 = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

function normalizeHexColor(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1]}` : null;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CpqPositionCard({
  quoteId,
  position,
  onUpdated,
  readOnly = false,
  salePriceMonthlyForPosition: _salePriceMonthlyForPosition = 0,
  clientHourlyRate: _clientHourlyRate = 0,
  displayCurrency = "CLP",
  ufValue = null,
}: CpqPositionCardProps) {
  const { puestos, cargos, roles } = useCpqCatalogs();
  const [draft, setDraft] = useState(() => positionToDraft(position));
  const [saving, setSaving] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const syncBarrierRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const serverTick = `${position.id}:${position.updatedAt}`;

  useEffect(() => {
    if (syncBarrierRef.current) return;
    setDraft(positionToDraft(position));
  }, [serverTick]);

  const titleLabel = useMemo(() => {
    const pName = puestos.find((p) => p.id === draft.puestoTrabajoId)?.name;
    const cName = cargos.find((c) => c.id === draft.cargoId)?.name;
    const rName = roles.find((r) => r.id === draft.rolId)?.name;
    const label = [pName, cName, rName].filter(Boolean).join(" · ");
    return label || position.customName || position.puestoTrabajo?.name || "Puesto";
  }, [draft.puestoTrabajoId, draft.cargoId, draft.rolId, puestos, cargos, roles, position.customName, position.puestoTrabajo?.name]);

  const shiftType = getShiftType(draft.startTime);
  const badgeBase = "h-6 rounded-md border px-1.5 text-sm font-semibold leading-none";
  const totalGuards = draft.numGuards * (draft.numPuestos || 1);
  const selectedRole = roles.find((r) => r.id === draft.rolId);
  const roleColor = normalizeHexColor(selectedRole?.colorHex);
  const roleChipStyle = roleColor
    ? {
        borderColor: hexToRgba(roleColor, 0.45),
        backgroundColor: hexToRgba(roleColor, 0.14),
        color: roleColor,
      }
    : undefined;

  const persist = useCallback(
    async (d: PositionDraft) => {
      if (readOnly) return;
      if (!d.weekdays?.length) {
        toast.error("Selecciona al menos un día");
        return;
      }
      const cargoName = cargos.find((c) => c.id === d.cargoId)?.name || "";
      const puestoName = puestos.find((p) => p.id === d.puestoTrabajoId)?.name || "";
      const resolvedName = [cargoName, puestoName].filter(Boolean).join(" - ") || null;
      const healthPlanPctEff = d.healthSystem === "isapre" ? d.healthPlanPct || 0.07 : 0.07;

      syncBarrierRef.current = true;
      setSaving(true);
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puestoTrabajoId: d.puestoTrabajoId,
            cargoId: d.cargoId,
            rolId: d.rolId,
            weekdays: d.weekdays,
            startTime: d.startTime,
            endTime: d.endTime,
            numGuards: d.numGuards,
            numPuestos: d.numPuestos,
            baseSalary: d.baseSalary,
            afpName: d.afpName,
            healthSystem: d.healthSystem,
            healthPlanPct: healthPlanPctEff,
            customName: resolvedName,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error al guardar");
        onUpdated?.();
      } catch (e) {
        console.error(e);
        toast.error("No se pudo guardar el puesto");
        onUpdated?.();
      } finally {
        setSaving(false);
        syncBarrierRef.current = false;
      }
    },
    [readOnly, cargos, puestos, quoteId, position.id, onUpdated]
  );

  const schedulePersist = useCallback(
    (next: PositionDraft) => {
      setDraft(next);
      if (readOnly) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void persist(next);
      }, 500);
    },
    [readOnly, persist]
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const updateDraft = (patch: Partial<PositionDraft>) => {
    const next = { ...draftRef.current, ...patch };
    schedulePersist(next);
  };

  const toggleWeekday = (day: string) => {
    const prev = draftRef.current.weekdays;
    const has = prev.includes(day);
    const nextDays = has ? prev.filter((x) => x !== day) : [...prev, day];
    if (nextDays.length === 0) {
      toast.error("Debe quedar al menos un día");
      return;
    }
    updateDraft({ weekdays: nextDays });
  };

  const applyWeekdayPreset = (preset: "weekdays" | "weekend" | "all" | "clear") => {
    if (preset === "clear") {
      toast.error("Debe quedar al menos un día");
      return;
    }
    const map = {
      all: [...WEEKDAY_ORDER],
      weekdays: WEEKDAY_ORDER.slice(0, 5),
      weekend: WEEKDAY_ORDER.slice(5),
    } as const;
    updateDraft({ weekdays: [...map[preset]] });
  };

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRecalculate: true }),
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error recalculating position:", err);
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar este puesto?")) return;
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "DELETE",
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error deleting position:", err);
    }
  };

  const handleClone = async () => {
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}/clone`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Puesto clonado");
      onUpdated?.();
    } catch (err) {
      console.error("Error cloning position:", err);
      toast.error("No se pudo clonar el puesto");
    }
  };

  const rotationLabel =
    roles.find((r) => r.id === draft.rolId)?.name ??
    ((draft.weekdays?.length ?? 7) >= 6 ? "6x1" : (draft.weekdays?.length ?? 5) === 5 ? "5x2" : `${draft.weekdays?.length ?? 0}x${7 - (draft.weekdays?.length ?? 0)}`);

  const fieldBg = "bg-card border-border/60";
  const selectCls = `flex h-8 w-full rounded-md border px-2 text-sm ${fieldBg}`;

  if (readOnly) {
    const net = position.netSalary != null ? Number(position.netSalary) : NaN;
    const netOk = Number.isFinite(net) && net > 0;
    return (
      <Card className="overflow-hidden border border-muted/40">
        <div className={cn("px-3 py-2.5 space-y-2", CPQ_BREAKDOWN_SHELL)}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-start">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-foreground break-words">{titleLabel}</div>
              <div className="flex items-center gap-1 flex-wrap mt-1">
                <Badge variant="outline" className={cn(badgeBase, "border-status-ok-border bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg")}>
                  {totalGuards} {totalGuards === 1 ? "guardia" : "guardias"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    badgeBase,
                    shiftType === "night"
                      ? "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg"
                      : "border-status-warn-border bg-status-warn-soft text-status-warn-fg dark:text-status-warn-fg"
                  )}
                >
                  {shiftType === "night" ? <Moon className="mr-0.5 h-2.5 w-2.5 inline" /> : <Sun className="mr-0.5 h-2.5 w-2.5 inline" />}
                  {shiftType === "night" ? "Nocturno" : "Diurno"}
                </Badge>
                <Badge variant="outline" className={cn(badgeBase, "border-status-info-border bg-status-info-soft text-status-info-fg")}>
                  {formatWeekdaysShort(position.weekdays)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {position.startTime}-{position.endTime} · {rotationLabel}
                {position.cargo?.name ? ` · ${position.cargo.name}` : ""}
              </div>
            </div>
            <div className={cpqBreakdownAmount()}>
              <CpqDualCurrencyAmount
                clp={Number(position.monthlyPositionCost)}
                currency={displayCurrency}
                ufValue={ufValue}
                size="md"
                primaryClassName="text-foreground font-bold"
              />
            </div>
          </div>
          {netOk ? (
            <div className="rounded-md border border-status-info-border bg-status-info-soft/30 px-2 py-1.5">
              <p className="text-sm font-semibold uppercase tracking-wide text-status-info-fg">Sueldo líquido estimado</p>
              <div className="mt-0.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <span className="text-sm text-muted-foreground">Por guardia / mes</span>
                <CpqDualCurrencyAmount
                  clp={Math.round(net)}
                  currency={displayCurrency}
                  ufValue={ufValue}
                  size="md"
                  primaryClassName="text-status-info-fg font-semibold"
                />
              </div>
              {totalGuards > 1 && (
                <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-status-info-border pt-1">
                  <span className="text-sm text-muted-foreground">Total puesto ({totalGuards} guardias)</span>
                  <CpqDualCurrencyAmount
                    clp={Math.round(net * totalGuards)}
                    currency={displayCurrency}
                    ufValue={ufValue}
                    size="sm"
                    primaryClassName="text-status-info-fg font-medium"
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-status-warn-fg">
              Sueldo líquido: sin estimación en datos del puesto.
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/70">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-muted/15 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground break-words">{titleLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "h-6 gap-1 rounded-md px-1.5 text-xs font-semibold",
                shiftType === "night"
                  ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                  : "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
              )}
            >
              {shiftType === "night" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
              {shiftType === "night" ? "Noche" : "Día"}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "h-6 rounded-md px-1.5 text-xs font-semibold",
                !roleColor && "border-primary/30 bg-primary/10 text-primary"
              )}
              style={roleChipStyle}
            >
              {rotationLabel}
            </Badge>
            <Badge variant="outline" className="h-6 rounded-md border-border/60 bg-background/40 px-1.5 text-xs font-medium">
              {totalGuards} guardia{totalGuards !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="h-6 rounded-md border-border/60 bg-background/40 px-1.5 font-mono text-xs font-medium">
              {draft.startTime}-{draft.endTime}
            </Badge>
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Guardando
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={handleClone} title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={handleDelete} title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guardias</Label>
            <input
              type="number"
              min={1}
              className={selectCls}
              value={draft.numGuards}
              onChange={(e) => updateDraft({ numGuards: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Puestos</Label>
            <select className={selectCls} value={draft.numPuestos} onChange={(e) => updateDraft({ numPuestos: Number(e.target.value) })}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sueldo bruto</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatNumber(draft.baseSalary, { minDecimals: 0, maxDecimals: 0 })}
              onChange={(e) => updateDraft({ baseSalary: parseLocalizedNumber(e.target.value) || 0 })}
              className={cn("h-8 text-sm", fieldBg)}
            />
          </div>
        </div>

        {(puestos.length > 0 || cargos.length > 0 || roles.length > 0) && (
          <div className="grid gap-2 sm:grid-cols-3">
            {puestos.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo de puesto</Label>
                <select className={selectCls} value={draft.puestoTrabajoId} onChange={(e) => updateDraft({ puestoTrabajoId: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  {puestos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {cargos.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cargo</Label>
                <select className={selectCls} value={draft.cargoId} onChange={(e) => updateDraft({ cargoId: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  {cargos.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {roles.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rol</Label>
                <select className={selectCls} value={draft.rolId} onChange={(e) => updateDraft({ rolId: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Días</Label>
            <div className="flex flex-wrap items-center gap-1">
              {WEEKDAY_ORDER.map((d) => {
                const active = draft.weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "h-7 min-w-[2rem] rounded-md border px-1 text-xs font-semibold transition-colors",
                      active ? "border-primary/30 bg-primary/15 text-primary" : "border-border/60 bg-card text-muted-foreground hover:bg-muted/40"
                    )}
                    onClick={() => toggleWeekday(d)}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-semibold transition-colors",
                shiftType !== "night"
                  ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                  : "border-status-warn-border bg-card text-status-warn-fg/60 hover:bg-status-warn-soft"
              )}
              onClick={() => updateDraft({ startTime: "08:00", endTime: "20:00" })}
            >
              Día
            </button>
            <button
              type="button"
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-semibold transition-colors",
                shiftType === "night"
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                  : "border-violet-500/20 bg-card text-violet-300/60 hover:bg-violet-500/5"
              )}
              onClick={() => updateDraft({ startTime: "20:00", endTime: "08:00" })}
            >
              Noche
            </button>
          </div>
          <div className="flex gap-1">
            <select className={cn(selectCls, "w-[92px] font-mono")} value={draft.startTime} onChange={(e) => updateDraft({ startTime: e.target.value })}>
              {HOURS_24.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select className={cn(selectCls, "w-[92px] font-mono")} value={draft.endTime} onChange={(e) => updateDraft({ endTime: e.target.value })}>
              {HOURS_24.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applyWeekdayPreset("weekdays")}>
            Lun-Vie
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applyWeekdayPreset("weekend")}>
            Sáb-Dom
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => applyWeekdayPreset("all")}>
            Todos
          </Button>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Costo empresa / mes</p>
              <CpqDualCurrencyAmount
                clp={Number(position.monthlyPositionCost)}
                currency={displayCurrency}
                ufValue={ufValue}
                size="sm"
                primaryClassName="font-semibold text-foreground"
                align="left"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Por guardia</p>
              <CpqDualCurrencyAmount
                clp={Number(position.employerCost)}
                currency={displayCurrency}
                ufValue={ufValue}
                size="sm"
                primaryClassName="font-semibold text-foreground"
                align="left"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sueldo líquido</p>
              {position.netSalary != null && Number(position.netSalary) > 0 ? (
                <CpqDualCurrencyAmount
                  clp={Math.round(Number(position.netSalary))}
                  currency={displayCurrency}
                  ufValue={ufValue}
                  size="sm"
                  primaryClassName="font-semibold text-foreground"
                  align="left"
                />
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Sin estimación</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleRecalculate} disabled={recalcLoading}>
              <RefreshCw className={cn("mr-1 h-3 w-3", recalcLoading && "animate-spin")} />
              Recalcular
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
