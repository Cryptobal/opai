"use client";

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Selector de cotización activa de la columna izquierda. Solo presentación:
 * el handler (updateActiveQuotation) y el estado llegan por props sin reescribir
 * la lógica; las etiquetas de las opciones se arman en el contenedor.
 */
export interface DealQuoteSelectProps {
  selectValue: string;
  onChange: (value: string) => void;
  updating: boolean;
  /** No hay cotizaciones enviadas → selector deshabilitado. */
  hasSent: boolean;
  autoLabel: string;
  options: Array<{ id: string; label: string }>;
  helperText: string;
}

export function DealAboutQuoteSelect({
  selectValue,
  onChange,
  updating,
  hasSent,
  autoLabel,
  options,
  helperText,
}: DealQuoteSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>Cotización activa</Label>
      <Select value={selectValue} onValueChange={onChange} disabled={updating || !hasSent}>
        <SelectTrigger className="h-auto min-h-9 text-xs">
          <SelectValue
            placeholder={hasSent ? "Selecciona cotización activa" : "Sin cotizaciones enviadas"}
          />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-24px)]">
          <SelectItem value="__auto__" className="whitespace-normal break-words pr-2">
            {autoLabel}
          </SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id} className="whitespace-normal break-words pr-2">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-ds-text-3">{helperText}</p>
      {updating && (
        <div className="inline-flex items-center gap-1 text-[11px] text-ds-text-3">
          <Loader2 className="h-3 w-3 animate-spin" />
          Guardando selección…
        </div>
      )}
    </div>
  );
}
