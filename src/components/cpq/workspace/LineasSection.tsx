"use client";

/**
 * Sección Líneas adicionales (extraída de CpqQuoteDetail sin cambio visual).
 * El precio se almacena SIEMPRE en CLP; en cotizaciones UF el input opera en UF
 * y se convierte con el valor del día. El guardado corre por el auto-save de
 * financieros del workspace (PUT /costs) — misma fórmula del motor.
 */

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { cn, parseLocalizedNumber } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import { LocalizedNumberInput } from "@/components/cpq/LocalizedNumberInput";
import {
  CPQ_BREAKDOWN_SHELL,
  CPQ_BREAKDOWN_ROW,
  cpqBreakdownAmount,
} from "@/components/cpq/cpqBreakdownLayout";
import type { CpqQuoteAdditionalLine } from "@/types/cpq";
import { SectionCard } from "./SectionCard";

export function LineasSection({
  open,
  onToggle,
  lines,
  setLines,
  isLocked,
  currency,
  ufValue,
  addlIsUf,
  addlToInput,
  addlFromInput,
  additionalLinesTotal,
  savingFinancials,
  onSaveNow,
}: {
  open: boolean;
  onToggle: () => void;
  lines: CpqQuoteAdditionalLine[];
  setLines: Dispatch<SetStateAction<CpqQuoteAdditionalLine[]>>;
  isLocked: boolean;
  currency: string;
  ufValue: number | null;
  addlIsUf: boolean;
  addlToInput: (clp: number) => number;
  addlFromInput: (entered: number) => number;
  additionalLinesTotal: number;
  savingFinancials: boolean;
  onSaveNow: () => void;
}) {
  return (
    <SectionCard
      id="sec-lineas"
      title="Líneas adicionales"
      open={open}
      onToggle={onToggle}
      cardClassName="overflow-hidden scroll-mt-44 sm:scroll-mt-32"
      bodyClassName="space-y-2 bg-card/60 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4"
      bodyInert={isLocked}
      summary={
        lines.length > 0 ? (
          <span className="text-xs text-muted-foreground truncate">
            {lines.length} {lines.length === 1 ? "línea" : "líneas"} —{" "}
            <span className="inline-flex align-middle">
              <CpqDualCurrencyAmount
                clp={additionalLinesTotal}
                currency={currency}
                ufValue={ufValue}
                size="xs"
                inline
                primaryClassName="text-foreground font-medium"
              />
            </span>
          </span>
        ) : undefined
      }
    >
      {lines.map((line, idx) => {
        const precioBase = Number(line.precio || 0) * Number(line.cantidad || 1);
        const mPct = Number(line.marginPct || 0);
        const precioVenta = mPct > 0 && mPct < 100 ? precioBase / (1 - mPct / 100) : precioBase;
        const isUnico = line.recurrencia === "unico";

        return (
          <div key={idx} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
            <div className={cn(CPQ_BREAKDOWN_SHELL, "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 sm:items-start")}>
              <div className="min-w-0">
                <Input
                  placeholder="Nombre del servicio/producto"
                  value={line.nombre}
                  onChange={(e) => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], nombre: e.target.value };
                    setLines(updated);
                  }}
                  className="h-7 bg-transparent border-none text-[13px] font-semibold p-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
                  disabled={isLocked}
                />
                <Input
                  placeholder="Descripción (opcional)"
                  value={line.descripcion}
                  onChange={(e) => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], descripcion: e.target.value };
                    setLines(updated);
                  }}
                  className="h-6 bg-transparent border-none text-sm text-muted-foreground p-0 focus-visible:ring-0 placeholder:text-muted-foreground/40"
                  disabled={isLocked}
                />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {/* Tipo badges */}
                  {(["servicio", "arriendo", "producto", "asesoria", "equipamiento"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        const updated = [...lines];
                        updated[idx] = { ...updated[idx], tipo: t };
                        setLines(updated);
                      }}
                      className={cn(
                        "h-5 rounded px-1.5 text-xs font-semibold capitalize transition-colors",
                        (line.tipo || "servicio") === t
                          ? "bg-tint-violet text-tint-violet-fg border border-tint-violet-fg/30"
                          : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-border mx-0.5" />
                  {/* Recurrencia */}
                  {([
                    { value: "mensual", label: "Mensual" },
                    { value: "unico", label: "Pago único" },
                  ] as const).map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        const updated = [...lines];
                        updated[idx] = { ...updated[idx], recurrencia: r.value };
                        setLines(updated);
                      }}
                      className={cn(
                        "h-5 rounded px-1.5 text-xs font-semibold transition-colors",
                        (line.recurrencia || "mensual") === r.value
                          ? "bg-status-info-soft text-status-info-fg border border-status-info-border"
                          : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{addlIsUf ? "UF" : "$"}</span>
                  <LocalizedNumberInput
                    placeholder="Precio"
                    value={addlToInput(Number(line.precio || 0))}
                    maxDecimals={addlIsUf ? 2 : 0}
                    onValueChange={(entered) => {
                      const updated = [...lines];
                      updated[idx] = { ...updated[idx], precio: addlFromInput(entered) || 0 };
                      setLines(updated);
                    }}
                    className="h-7 w-24 bg-card text-foreground border-border text-xs text-right font-mono"
                    disabled={isLocked}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-status-danger-fg/60 hover:text-status-danger-fg hover:bg-status-danger-soft"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={isLocked}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Margen:</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={line.marginPct ? String(line.marginPct) : ""}
                      onChange={(e) => {
                        const updated = [...lines];
                        const val = parseLocalizedNumber(e.target.value);
                        updated[idx] = { ...updated[idx], marginPct: val || null };
                        setLines(updated);
                      }}
                      className="h-6 w-12 bg-card text-foreground border-border text-xs text-right font-mono px-1"
                      disabled={isLocked}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="flex flex-col items-start sm:items-end">
                  <div className="flex items-baseline gap-1">
                    <CpqDualCurrencyAmount
                      clp={precioVenta}
                      currency={currency}
                      ufValue={ufValue}
                      size="sm"
                      inline
                      primaryClassName={cn("text-[13px] font-bold", isUnico && "text-status-warn-fg")}
                    />
                    <span className="text-xs text-muted-foreground font-normal">
                      {isUnico ? "pago único" : "/mes"}
                    </span>
                  </div>
                  {isUnico && (
                    <span className="text-[11px] text-status-warn-fg">Se cobra una sola vez</span>
                  )}
                  {mPct > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Base:</span>
                      <CpqDualCurrencyAmount
                        clp={precioBase}
                        currency={currency}
                        ufValue={ufValue}
                        size="xs"
                        inline
                        hideSecondary
                        primaryClassName="text-muted-foreground"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {!isLocked && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-tint-violet-fg/30 text-tint-violet-fg hover:bg-tint-violet"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { nombre: "", descripcion: "", precio: 0, orden: prev.length, tipo: "servicio", recurrencia: "mensual", cantidad: 1, marginPct: null },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5" /> Agregar línea
          </Button>
          {lines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft"
              disabled={savingFinancials}
              onClick={onSaveNow}
            >
              {savingFinancials ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          )}
        </div>
      )}
      {lines.length > 0 && (
        <div className={cn(CPQ_BREAKDOWN_SHELL, CPQ_BREAKDOWN_ROW, "pt-1 border-t border-tint-violet-fg/20 text-xs")}>
          <span className="text-sm font-medium text-tint-violet-fg break-words min-w-0">Total líneas adicionales</span>
          <div className={cpqBreakdownAmount()}>
            <CpqDualCurrencyAmount
              clp={additionalLinesTotal}
              currency={currency}
              ufValue={ufValue}
              size="sm"
              primaryClassName="font-bold text-tint-violet-fg"
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}
