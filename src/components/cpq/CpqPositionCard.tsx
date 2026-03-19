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
import { formatCurrency, formatWeekdaysShort, getShiftType, WEEKDAY_ORDER } from "@/components/cpq/utils";
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
    weekdays: [...(p.weekdays || [])],
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

const HOURS_24 = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

export function CpqPositionCard({
  quoteId,
  position,
  onUpdated,
  readOnly = false,
  salePriceMonthlyForPosition: _salePriceMonthlyForPosition = 0,
  clientHourlyRate: _clientHourlyRate = 0,
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
  const badgeBase = "h-5 rounded-md border px-1.5 text-[10px] font-semibold leading-none";
  const totalGuards = draft.numGuards * (draft.numPuestos || 1);

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

  const fieldBg = "bg-[#1a1a1a] border-border/60";
  const selectCls = `flex h-7 w-full rounded-md border px-2 text-xs ${fieldBg}`;

  if (readOnly) {
    return (
      <Card className="overflow-hidden border border-muted/40">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-foreground truncate">{titleLabel}</div>
            <div className="flex items-center gap-1 flex-wrap mt-1">
              <Badge variant="outline" className={cn(badgeBase, "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
                {totalGuards} {totalGuards === 1 ? "guardia" : "guardias"}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  badgeBase,
                  shiftType === "night"
                    ? "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                )}
              >
                {shiftType === "night" ? <Moon className="mr-0.5 h-2.5 w-2.5 inline" /> : <Sun className="mr-0.5 h-2.5 w-2.5 inline" />}
                {shiftType === "night" ? "Nocturno" : "Diurno"}
              </Badge>
              <Badge variant="outline" className={cn(badgeBase, "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400")}>
                {formatWeekdaysShort(position.weekdays)}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {position.startTime}-{position.endTime} · {rotationLabel}
              {position.cargo?.name ? ` · ${position.cargo.name}` : ""}
            </div>
          </div>
          <span className="text-[14px] font-bold tabular-nums text-foreground shrink-0">{formatCurrency(Number(position.monthlyPositionCost))}</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-[#0a0a0a] p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold truncate">{titleLabel}</div>
            <div className="flex items-center gap-1 flex-wrap mt-1">
              <Badge variant="outline" className="h-5 text-[10px] gap-0.5">
                {shiftType === "night" ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
                {shiftType === "night" ? "Noche" : "Día"}
              </Badge>
              {saving && (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" onClick={handleClone} title="Duplicar">
              <Copy className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleDelete} title="Eliminar">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-[10px]">Guardias</Label>
            <select className={selectCls} value={draft.numGuards} onChange={(e) => updateDraft({ numGuards: Number(e.target.value) })}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Nº Puestos</Label>
            <select className={selectCls} value={draft.numPuestos} onChange={(e) => updateDraft({ numPuestos: Number(e.target.value) })}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Sueldo bruto</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatNumber(draft.baseSalary, { minDecimals: 0, maxDecimals: 0 })}
              onChange={(e) => updateDraft({ baseSalary: parseLocalizedNumber(e.target.value) || 0 })}
              className={cn("h-7 text-xs", fieldBg)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Turno</Label>
            <div className="flex gap-1">
              <button
                type="button"
                className={cn(
                  "flex-1 h-7 rounded-md border text-[10px] font-medium",
                  shiftType !== "night" ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-border text-muted-foreground"
                )}
                onClick={() => updateDraft({ startTime: "08:00", endTime: "20:00" })}
              >
                Día
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 h-7 rounded-md border text-[10px] font-medium",
                  shiftType === "night" ? "border-purple-500/40 bg-purple-500/10 text-purple-400" : "border-border text-muted-foreground"
                )}
                onClick={() => updateDraft({ startTime: "20:00", endTime: "08:00" })}
              >
                Noche
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Inicio</Label>
            <select className={cn(selectCls, "font-mono")} value={draft.startTime} onChange={(e) => updateDraft({ startTime: e.target.value })}>
              {HOURS_24.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Término</Label>
            <select className={cn(selectCls, "font-mono")} value={draft.endTime} onChange={(e) => updateDraft({ endTime: e.target.value })}>
              {HOURS_24.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {(puestos.length > 0 || cargos.length > 0 || roles.length > 0) && (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {puestos.length > 0 && (
              <div className="space-y-1">
                <Label className="text-[10px]">Tipo de Puesto</Label>
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
                <Label className="text-[10px]">Cargo</Label>
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
                <Label className="text-[10px]">Rol</Label>
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

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Días:</span>
          {WEEKDAY_ORDER.map((d) => {
            const active = draft.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={cn(
                  "h-5 min-w-[1.75rem] px-1 rounded text-[9px] font-bold transition-colors",
                  active ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground border border-transparent"
                )}
                onClick={() => toggleWeekday(d)}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div className="text-[10px] space-y-1 pt-1 border-t border-border/40">
          <div className="text-muted-foreground">
            {draft.startTime}-{draft.endTime} · {draft.numGuards} guardia(s)
            {(draft.numPuestos || 1) > 1 ? ` × ${draft.numPuestos} puestos = ${totalGuards} guardias totales` : ""}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-emerald-400 font-semibold">
              Costo empresa: {formatCurrency(Number(position.monthlyPositionCost))}/mes
              <span className="text-muted-foreground font-normal ml-1">({formatCurrency(Number(position.employerCost))}/guardia)</span>
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleRecalculate} disabled={recalcLoading}>
              <RefreshCw className={cn("h-3 w-3 mr-1", recalcLoading && "animate-spin")} />
              Recalcular
            </Button>
          </div>
        </div>
    </div>
  );
}
