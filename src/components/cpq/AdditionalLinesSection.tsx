"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/components/cpq/utils";
import { cn, parseLocalizedNumber, formatNumber } from "@/lib/utils";
import { Plus, Trash2, BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface AdditionalLineItem {
  nombre: string;
  descripcion: string;
  precio: number;
  orden: number;
  tipo?: string;
  recurrencia?: string;
  cantidad?: number;
  marginPct?: number | null;
}

interface AdditionalLinesSectionProps {
  lines: AdditionalLineItem[];
  onChange: (lines: AdditionalLineItem[]) => void;
  contractDuration?: number;
  isLocked?: boolean;
  onSaveToCatalog?: (payload: { name: string; unit: string; basePrice: number; type: string }) => Promise<void>;
}

const LINE_TYPES = [
  { value: "servicio", label: "Servicio" },
  { value: "arriendo", label: "Arriendo" },
  { value: "producto", label: "Producto" },
  { value: "asesoria", label: "Asesoría" },
  { value: "equipamiento", label: "Equip." },
] as const;

const RECURRENCE_TYPES = [
  { value: "mensual", label: "Mensual" },
  { value: "unico", label: "Único" },
  { value: "por_evento", label: "Por evento" },
] as const;

export function AdditionalLinesSection({ lines, onChange, contractDuration = 12, isLocked, onSaveToCatalog }: AdditionalLinesSectionProps) {
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const addLine = () => {
    onChange([
      ...lines,
      {
        nombre: "",
        descripcion: "",
        precio: 0,
        orden: lines.length,
        tipo: "servicio",
        recurrencia: "mensual",
        cantidad: 1,
        marginPct: null,
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<AdditionalLineItem>) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], ...patch };
    onChange(updated);
  };

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  const handleSaveToCatalog = async (idx: number, line: AdditionalLineItem) => {
    if (!onSaveToCatalog) return;
    const name = line.nombre.trim();
    if (!name) {
      toast.error("Ingresa un nombre antes de guardar en catálogo");
      return;
    }
    setSavingIdx(idx);
    try {
      await onSaveToCatalog({
        name,
        unit: "mes",
        basePrice: Number(line.precio || 0),
        type: "other",
      });
      toast.success(`"${name}" guardado en catálogo`);
    } catch {
      toast.error("Error al guardar en catálogo");
    } finally {
      setSavingIdx(null);
    }
  };

  const total = lines.reduce((sum, line) => {
    const base = Number(line.precio || 0) * Number(line.cantidad || 1);
    const mPct = Number(line.marginPct || 0);
    const venta = mPct > 0 && mPct < 100 ? base / (1 - mPct / 100) : base;
    const isUnico = line.recurrencia === "unico";
    return sum + (isUnico && contractDuration > 0 ? venta / contractDuration : venta);
  }, 0);

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const precioBase = Number(line.precio || 0) * Number(line.cantidad || 1);
        const mPct = Number(line.marginPct || 0);
        const precioVenta = mPct > 0 && mPct < 100 ? precioBase / (1 - mPct / 100) : precioBase;
        const isUnico = line.recurrencia === "unico";
        const precioMensual = isUnico && contractDuration > 0 ? precioVenta / contractDuration : precioVenta;

        return (
          <div key={idx} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="Nombre del servicio/producto"
                  value={line.nombre}
                  onChange={(e) => updateLine(idx, { nombre: e.target.value })}
                  disabled={isLocked}
                  className="h-7 text-xs bg-card border-border"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!isLocked && onSaveToCatalog && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-emerald-400"
                    title="Guardar en catálogo"
                    onClick={() => handleSaveToCatalog(idx, line)}
                    disabled={savingIdx === idx}
                  >
                    {savingIdx === idx
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <BookmarkPlus className="h-3 w-3" />
                    }
                  </Button>
                )}
                {!isLocked && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeLine(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-1.5">
              <Input
                placeholder="Descripción (opcional)"
                value={line.descripcion || ""}
                onChange={(e) => updateLine(idx, { descripcion: e.target.value })}
                disabled={isLocked}
                className="h-7 text-xs bg-card border-border"
              />
            </div>

            {/* Type pills */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {LINE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={isLocked}
                  className={cn(
                    "h-5 rounded px-1.5 text-[10px] font-medium border transition-colors",
                    (line.tipo || "servicio") === t.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => updateLine(idx, { tipo: t.value })}
                >
                  {t.label}
                </button>
              ))}
              <span className="mx-0.5" />
              {RECURRENCE_TYPES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={isLocked}
                  className={cn(
                    "h-5 rounded px-1.5 text-[10px] font-medium border transition-colors",
                    (line.recurrencia || "mensual") === r.value
                      ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => updateLine(idx, { recurrencia: r.value })}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Price row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1.5">
              <div>
                <Label className="text-[10px] text-muted-foreground">Precio base</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked}
                  value={formatNumber(Number(line.precio || 0))}
                  onChange={(e) => updateLine(idx, { precio: parseLocalizedNumber(e.target.value) })}
                  className="h-7 text-xs bg-card border-border"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  disabled={isLocked}
                  value={line.cantidad || 1}
                  onChange={(e) => updateLine(idx, { cantidad: Number(e.target.value) || 1 })}
                  className="h-7 text-xs bg-card border-border"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Margen %</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  disabled={isLocked}
                  value={line.marginPct ?? ""}
                  onChange={(e) => updateLine(idx, { marginPct: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 text-xs bg-card border-border"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Calculated total */}
            <div className="flex justify-end mt-1 text-[10px]">
              <span className="text-muted-foreground">
                Venta: <span className="font-mono font-semibold text-purple-400">{formatCurrency(precioMensual)}</span>/mes
                {isUnico && ` (${formatCurrency(precioVenta)} / ${contractDuration}m)`}
              </span>
            </div>
          </div>
        );
      })}

      {!isLocked && (
        <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={addLine}>
          <Plus className="h-3 w-3" /> Agregar línea
        </Button>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between pt-1 border-t border-purple-500/20">
          <span className="text-[11px] font-medium text-purple-300">Total líneas adicionales</span>
          <span className="text-sm font-bold font-mono text-purple-300">{formatCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}
