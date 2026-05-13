"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Loader2, Moon, Sun, Trash2 } from "lucide-react";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { getShiftType, WEEKDAY_ORDER, normalizeWeekdays } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type { CpqPosition } from "@/types/cpq";
import { toast } from "sonner";

const HOURS_24 = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

interface CpqShiftCompactCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated: () => void;
  readOnly?: boolean;
  displayCurrency?: string;
  ufValue?: number | null;
}

type Draft = {
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos: number;
  baseSalary: number;
};

function toDraft(p: CpqPosition): Draft {
  return {
    weekdays: normalizeWeekdays(p.weekdays),
    startTime: p.startTime,
    endTime: p.endTime,
    numGuards: p.numGuards,
    numPuestos: p.numPuestos || 1,
    baseSalary: Number(p.baseSalary),
  };
}

export function CpqShiftCompactCard({
  quoteId,
  position,
  onUpdated,
  readOnly,
  displayCurrency = "CLP",
  ufValue,
}: CpqShiftCompactCardProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(position));
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const tick = `${position.id}:${position.updatedAt}`;
  const barrier = useRef(false);

  useEffect(() => {
    if (!barrier.current) setDraft(toDraft(position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const shiftType = getShiftType(draft.startTime);
  const totalGuards = draft.numGuards * (draft.numPuestos || 1);

  const persist = useCallback(
    async (d: Draft) => {
      if (readOnly) return;
      if (!d.weekdays.length) {
        toast.error("Selecciona al menos un día");
        return;
      }
      barrier.current = true;
      setSaving(true);
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error");
        onUpdated();
      } catch (e) {
        console.error(e);
        toast.error("No se pudo guardar");
      } finally {
        setSaving(false);
        barrier.current = false;
      }
    },
    [quoteId, position.id, onUpdated, readOnly]
  );

  const schedule = (next: Draft) => {
    setDraft(next);
    if (readOnly) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), 500);
  };

  const update = (patch: Partial<Draft>) => schedule({ ...draftRef.current, ...patch });

  const toggleDay = (d: string) => {
    const prev = draftRef.current.weekdays;
    const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d];
    if (!next.length) {
      toast.error("Debe quedar al menos un día");
      return;
    }
    update({ weekdays: next });
  };

  const clone = async () => {
    try {
      const r = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}/clone`, {
        method: "POST",
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      toast.success("Turno clonado");
      onUpdated();
    } catch {
      toast.error("No se pudo clonar");
    }
  };

  const del = async () => {
    if (!confirm("¿Eliminar este turno?")) return;
    await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, { method: "DELETE" });
    onUpdated();
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
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
          className="h-6 rounded-md border-border/60 bg-background/40 px-1.5 font-mono text-xs"
        >
          {draft.startTime}–{draft.endTime}
        </Badge>
        <Badge
          variant="outline"
          className="h-6 rounded-md border-border/60 bg-background/40 px-1.5 text-xs"
        >
          {totalGuards}g
        </Badge>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {!readOnly && (
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clone}
              title="Duplicar"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={del}
              title="Eliminar"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Guardias
          </Label>
          <input
            type="number"
            min={1}
            disabled={readOnly}
            className="flex h-7 w-full rounded border border-border/50 bg-card px-1.5 text-xs"
            value={draft.numGuards}
            onChange={(e) => update({ numGuards: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Puestos
          </Label>
          <select
            className="flex h-7 w-full rounded border border-border/50 bg-card px-1.5 text-xs"
            disabled={readOnly}
            value={draft.numPuestos}
            onChange={(e) => update({ numPuestos: Number(e.target.value) })}
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Sueldo
          </Label>
          <Input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            value={formatNumber(draft.baseSalary, { minDecimals: 0, maxDecimals: 0 })}
            onChange={(e) => update({ baseSalary: parseLocalizedNumber(e.target.value) || 0 })}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-1.5 items-end">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Días</Label>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_ORDER.map((d) => {
              const on = draft.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={readOnly}
                  className={cn(
                    "h-6 min-w-[1.75rem] rounded border px-1 text-[11px] font-semibold transition-colors",
                    on
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/50 bg-card text-muted-foreground hover:bg-muted/40"
                  )}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-1">
          <select
            className="flex h-7 w-[78px] rounded border border-border/50 bg-card px-1.5 font-mono text-xs"
            disabled={readOnly}
            value={draft.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          >
            {HOURS_24.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="flex h-7 w-[78px] rounded border border-border/50 bg-card px-1.5 font-mono text-xs"
            disabled={readOnly}
            value={draft.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          >
            {HOURS_24.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-baseline pt-1 border-t border-border/40">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Costo mes
        </span>
        <CpqDualCurrencyAmount
          clp={Number(position.monthlyPositionCost)}
          currency={displayCurrency}
          ufValue={ufValue}
          size="sm"
          primaryClassName="font-semibold text-foreground"
          align="right"
        />
      </div>
    </div>
  );
}
