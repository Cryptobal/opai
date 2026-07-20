/**
 * Editor inline de un turno (estado expandido). Un solo panel abierto a la vez.
 * Al cambiar el rol autocompleta el sueldo bruto sugerido del rol y calcula
 * el líquido en vivo al teclear el bruto.
 */
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Trash2, Check, ArrowLeftRight, Sparkles, Loader2 } from "lucide-react";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { toast } from "sonner";
import { HOLIDAY_DAY, onlyRealWeekdays } from "@/lib/cpq/weekdays";
import {
  HOURS_24,
  WEEKDAY_ORDER,
  analizarTurno,
  DEFAULT_COLACION_MIN,
  defaultDiasForRol,
} from "./shift-utils";
import { JornadaHoursChip } from "./JornadaHoursChip";
import { CatalogPicker } from "./CatalogPicker";
import { useLiquidoPreview } from "./useLiquidoPreview";
import type { CpqCatalogOption, NormalizedShift, ShiftPatch } from "./types";

interface Props {
  row: NormalizedShift;
  catalogs: { puestos: CpqCatalogOption[]; cargos: CpqCatalogOption[]; roles: CpqCatalogOption[] };
  currency: string;
  ufValue?: number | null;
  disableLivePreview?: boolean;
  /** id de la cotización CPQ. Si viene, habilita "Redactar con IA". null en modo Lead. */
  quoteId?: string | null;
  onUpdate: (patch: ShiftPatch) => void;
  onClone: () => void;
  onDelete: () => void;
  onDone: () => void;
}

type Draft = Pick<
  NormalizedShift,
  | "customName"
  | "puestoId"
  | "cargoId"
  | "rolId"
  | "inicio"
  | "fin"
  | "dias"
  | "guardias"
  | "nPuestos"
  | "bruto"
  | "description"
>;

const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const FIELD = "flex h-10 sm:h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground";

export function ShiftRowEditor({
  row,
  catalogs,
  currency,
  ufValue,
  disableLivePreview,
  quoteId = null,
  onUpdate,
  onClone,
  onDelete,
  onDone,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({
    customName: row.customName ?? "",
    puestoId: row.puestoId,
    cargoId: row.cargoId,
    rolId: row.rolId,
    inicio: row.inicio,
    fin: row.fin,
    dias: row.dias,
    guardias: row.guardias,
    nPuestos: row.nPuestos || 1,
    bruto: row.bruto,
    description: row.description ?? "",
  }));
  const ref = useRef(draft);
  ref.current = draft;

  const apply = (patch: Partial<Draft>) => {
    let next = { ...ref.current, ...patch };
    // Al cambiar el rol, autocompletar el sueldo bruto sugerido del rol.
    if (patch.rolId !== undefined) {
      const rolSalary = catalogs.roles.find((r) => r.id === next.rolId)?.salary;
      if (rolSalary != null && rolSalary > 0) next = { ...next, bruto: rolSalary };
      const rolName = catalogs.roles.find((r) => r.id === next.rolId)?.name;
      const defDias = defaultDiasForRol(rolName);
      if (defDias) {
        const keepF = ref.current.dias.includes(HOLIDAY_DAY);
        next = { ...next, dias: keepF ? [...defDias, HOLIDAY_DAY] : defDias };
      }
    }
    setDraft(next);
    onUpdate(next);
  };

  const [aiLoading, setAiLoading] = useState(false);
  const handleAiDescription = async () => {
    if (!quoteId) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/position-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          positionId: row.id,
          customInstruction: draft.description?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo redactar");
      // El endpoint YA persistió; este apply re-PATCHea el mismo texto (debounce,
      // idempotente) y mantiene el estado local del editor coherente.
      apply({ description: data.data.description });
      toast.success("Observaciones redactadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo redactar");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleDay = (d: string) => {
    const has = ref.current.dias.includes(d);
    const next = has ? ref.current.dias.filter((x) => x !== d) : [...ref.current.dias, d];
    if (onlyRealWeekdays(next).length === 0) {
      toast.error("Debe quedar al menos un día");
      return;
    }
    apply({ dias: next });
  };

  const [colacionMin, setColacionMin] = useState<number>(DEFAULT_COLACION_MIN);

  const live = useLiquidoPreview(draft.bruto, { disabled: disableLivePreview, ufValue });
  const totalGuards = draft.guardias * (draft.nPuestos || 1);
  const liquido = live?.net ?? row.liquido ?? null;
  const perGuard = live?.employerPerGuard ?? row.costoPorGuardia ?? null;
  const costo = perGuard != null ? perGuard * totalGuards : row.costo ?? 0;
  const rolName = catalogs.roles.find((r) => r.id === draft.rolId)?.name;
  const jornada = analizarTurno({
    inicio: draft.inicio,
    fin: draft.fin,
    dias: draft.dias,
    rolName,
    colacionMin,
  });
  const puestoName = catalogs.puestos.find((p) => p.id === draft.puestoId)?.name || "Puesto";

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-card p-3">
      <Field label="Nombre del turno (opcional)">
        <Input
          value={draft.customName ?? ""}
          placeholder={puestoName}
          onChange={(e) => apply({ customName: e.target.value })}
          className="h-10 sm:h-9"
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Tipo de puesto">
          <CatalogPicker kind="puesto" value={draft.puestoId} onChange={(id) => apply({ puestoId: id })} triggerClassName="h-10 sm:h-9" />
        </Field>
        <Field label="Cargo">
          <CatalogPicker kind="cargo" value={draft.cargoId} onChange={(id) => apply({ cargoId: id })} triggerClassName="h-10 sm:h-9" />
        </Field>
        <Field label="Rol">
          <CatalogPicker kind="rol" value={draft.rolId} onChange={(id) => apply({ rolId: id })} triggerClassName="h-10 sm:h-9" />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <div>
          <Label className={LABEL}>Horario</Label>
          <div className="mt-1 flex items-center gap-1.5">
            <select className={cn(FIELD, "w-[88px] font-mono")} value={draft.inicio} onChange={(e) => apply({ inicio: e.target.value })}>
              {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-muted-foreground">–</span>
            <select className={cn(FIELD, "w-[88px] font-mono")} value={draft.fin} onChange={(e) => apply({ fin: e.target.value })}>
              {HOURS_24.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Invertir horario (día ↔ noche)"
              onClick={() => apply({ inicio: ref.current.fin, fin: ref.current.inicio })}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Colación</span>
              <select
                className={cn(FIELD, "w-[68px]")}
                value={colacionMin}
                onChange={(e) => setColacionMin(Number(e.target.value))}
                title="Minutos de colación (no imputable a la jornada)"
              >
                {[0, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m}m</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-1.5">
            <JornadaHoursChip analysis={jornada} variant="full" />
          </div>
        </div>
        <div>
          <Label className={LABEL}>Días</Label>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {WEEKDAY_ORDER.map((d, idx) => {
              const on = draft.dias.includes(d);
              const activeCls =
                idx < 5
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-tint-violet-fg/30 bg-tint-violet text-tint-violet-fg";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-9 min-w-[2.25rem] rounded-md border px-1.5 text-xs font-semibold transition-colors",
                    on ? activeCls : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {d}
                </button>
              );
            })}
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            {(() => {
              const on = draft.dias.includes(HOLIDAY_DAY);
              return (
                <button
                  type="button"
                  title="Cubre festivos"
                  onClick={() => toggleDay(HOLIDAY_DAY)}
                  className={cn(
                    "h-9 min-w-[2.25rem] rounded-md border px-1.5 text-xs font-semibold transition-colors",
                    on
                      ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                      : "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  F
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Guardias">
          <select className={FIELD} value={draft.guardias} onChange={(e) => apply({ guardias: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="N° Puestos">
          <select className={FIELD} value={draft.nPuestos} onChange={(e) => apply({ nPuestos: Number(e.target.value) })}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Sueldo bruto">
          <Input
            type="text"
            inputMode="numeric"
            value={formatNumber(draft.bruto, { minDecimals: 0, maxDecimals: 0 })}
            onChange={(e) => apply({ bruto: parseLocalizedNumber(e.target.value) || 0 })}
            className="h-10 sm:h-9 text-sm font-mono"
          />
        </Field>
        <Field label="Sueldo líquido">
          <div className={cn(FIELD, "items-center bg-muted/30")}>
            <span className="font-mono text-sm text-foreground">
              {liquido != null && liquido > 0 ? Math.round(liquido).toLocaleString("es-CL") : "—"}
            </span>
          </div>
        </Field>
      </div>

      <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <Label className={LABEL}>Observaciones del turno</Label>
          <div className="flex items-center gap-2">
            {quoteId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={aiLoading}
                onClick={handleAiDescription}
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                )}
                Redactar con IA
              </Button>
            ) : null}
            <span className="font-mono text-[10px] text-muted-foreground">
              {(draft.description ?? "").length}/500
            </span>
          </div>
        </div>
        <textarea
          value={draft.description ?? ""}
          maxLength={500}
          rows={3}
          placeholder="Funciones, protocolos o particularidades de este turno…"
          onChange={(e) => apply({ description: e.target.value })}
          className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
          Aparece en el PDF económico, la propuesta técnica y el portal del cliente.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex items-center gap-4">
          <div>
            <p className={LABEL}>Costo empresa / mes</p>
            <CpqDualCurrencyAmount clp={costo} currency={currency} ufValue={ufValue} size="sm" primaryClassName="font-semibold text-foreground" align="left" />
          </div>
          <div>
            <p className={LABEL}>Por guardia</p>
            <CpqDualCurrencyAmount clp={perGuard ?? 0} currency={currency} ufValue={ufValue} size="sm" primaryClassName="font-semibold text-foreground" align="left" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={onClone}>
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </Button>
          <Button type="button" size="sm" className="h-9 gap-1" onClick={onDone}>
            <Check className="h-3.5 w-3.5" /> Listo
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className={LABEL}>{label}</Label>
      {children}
    </div>
  );
}
