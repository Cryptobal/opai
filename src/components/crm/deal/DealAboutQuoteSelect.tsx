"use client";

import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface DealQuoteSelectProps {
  selectValue: string;
  onChange: (value: string) => void;
  updating: boolean;
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
}: DealQuoteSelectProps) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        Cotización activa
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <Select value={selectValue} onValueChange={onChange} disabled={updating || !hasSent}>
          <SelectTrigger className="h-10 max-w-[11rem] text-[13px] sm:h-9">
            <SelectValue placeholder={hasSent ? "Seleccionar" : "Sin cotizaciones"} />
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
        {updating ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ds-text-3" /> : null}
      </div>
    </div>
  );
}
