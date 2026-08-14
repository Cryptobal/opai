"use client";

import type { ReactNode } from "react";
import { CalendarClock, FileText } from "lucide-react";
import { formatCLP, formatUFSuffix } from "@/lib/utils";

type Props = {
  amountClp: number;
  amountUf: number;
  totalGuards: number;
  activeQuote: { code: string | null; statusLabel: string } | null;
  expectedCloseDate: string | null;
  nextStep: string | null;
  canEdit?: boolean;
  onCloseDateChange: (ymd: string) => void;
  onNextStepChange: (value: string) => void;
};

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[8.5rem] shrink-0 flex-col justify-center px-3.5 first:pl-1">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
        {label}
      </span>
      <span className="mt-0.5 truncate text-[15px] font-semibold leading-tight tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function DealKpiStrip({
  amountClp,
  amountUf,
  totalGuards,
  activeQuote,
  expectedCloseDate,
  nextStep,
  canEdit = true,
  onCloseDateChange,
  onNextStepChange,
}: Props) {
  const closeYmd = expectedCloseDate?.slice(0, 10) ?? "";

  return (
    <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-thin divide-x divide-ds-border-subtle px-1">
      <Item label="Monto mensual">
        <span className="text-status-ok-fg">{formatCLP(amountClp)}</span>
      </Item>
      <Item label="UF">
        <span className="text-status-info-fg">{formatUFSuffix(amountUf)}</span>
      </Item>
      <Item label="Guardias">{totalGuards.toLocaleString("es-CL")}</Item>
      <Item label="Cotización activa">
        {activeQuote?.code ? (
          <span className="inline-flex items-center gap-1.5 truncate">
            <FileText className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            <span className="truncate">{activeQuote.code}</span>
            <span className="text-[12px] font-medium text-ds-text-3">· {activeQuote.statusLabel}</span>
          </span>
        ) : (
          <span className="text-[13px] font-normal text-ds-text-3">Sin cotización</span>
        )}
      </Item>
      <Item label="Cierre estimado">
        {canEdit ? (
          <label className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
            <input
              type="date"
              value={closeYmd}
              onChange={(e) => onCloseDateChange(e.target.value)}
              className="h-10 min-w-[8.5rem] rounded-md border-0 bg-transparent text-[13px] font-semibold text-ds-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
              aria-label="Cierre estimado"
            />
          </label>
        ) : closeYmd ? (
          formatDate(closeYmd)
        ) : (
          <span className="text-[13px] font-normal text-ds-text-3">Sin fecha</span>
        )}
      </Item>
      <Item label="Próxima acción">
        {canEdit ? (
          <input
            type="text"
            defaultValue={nextStep ?? ""}
            key={nextStep ?? ""}
            onBlur={(e) => onNextStepChange(e.target.value)}
            placeholder="Definir"
            className="h-10 w-[11rem] rounded-md border-0 bg-transparent text-[13px] font-semibold text-ds-text-1 placeholder:text-ds-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
            aria-label="Próxima acción"
          />
        ) : (
          <span className="text-[13px] font-normal text-ds-text-3">{nextStep || "—"}</span>
        )}
      </Item>
    </div>
  );
}
