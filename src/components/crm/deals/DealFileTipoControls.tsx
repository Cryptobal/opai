"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import {
  LICITACION_CLASSIFY_OPTIONS,
  licitacionTipoLabel,
} from "@/modules/crm/documents/licitacion-corpus";

export function DealUploadAsSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (codigo: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-[13px] text-ds-text-2">
      <span className="shrink-0">Subir como:</span>
      <select
        className="h-10 min-w-[11rem] rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Subir como"
      >
        <option value="auto">Auto (sugerencia)</option>
        {LICITACION_CLASSIFY_OPTIONS.map((opt) => (
          <option key={opt.codigo} value={opt.codigo}>
            {opt.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DealFileSuggestChip({
  suggestedCodigo,
  disabled,
  onAccept,
}: {
  suggestedCodigo: string;
  disabled?: boolean;
  onAccept: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAccept}
      className="inline-flex min-h-10 items-center rounded-full border border-status-ok-border bg-status-ok-soft px-2.5 text-[12px] font-medium text-status-ok-fg sm:min-h-9"
    >
      Sugerido: {licitacionTipoLabel(suggestedCodigo)} ✓
    </button>
  );
}

export function DealFileQuickAssign({
  tipoCodigo,
  disabled,
  onAssign,
}: {
  tipoCodigo: string;
  disabled?: boolean;
  onAssign: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      className="h-10 text-[12px] sm:h-9"
      onClick={onAssign}
    >
      → Marcar como {licitacionTipoLabel(tipoCodigo)}
    </Button>
  );
}

export function DealFileTipoMenu({
  tipoCodigo,
  tipoNombre,
  disabled,
  onSelect,
}: {
  tipoCodigo: string | null;
  tipoNombre: string | null;
  disabled?: boolean;
  onSelect: (codigo: string | null) => void;
}) {
  const label = tipoNombre || licitacionTipoLabel(tipoCodigo);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex min-h-10 min-w-[44px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium sm:min-h-9",
            tipoCodigo
              ? "border-ds-border-default bg-ds-surface-2 text-ds-text-2"
              : "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
          )}
          aria-label="Elegir tipo de documento"
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {LICITACION_CLASSIFY_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.codigo}
            className="min-h-10 text-[13px] sm:min-h-9"
            onSelect={() => onSelect(opt.codigo)}
          >
            {opt.nombre}
            {tipoCodigo === opt.codigo ? (
              <Tag variant="ok" size="md" className="ml-auto">
                Actual
              </Tag>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10 text-[13px] sm:min-h-9"
          onSelect={() => onSelect(null)}
        >
          Quitar tipo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
