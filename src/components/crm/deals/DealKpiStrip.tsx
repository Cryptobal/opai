"use client";

import type { ReactNode } from "react";
import { CalendarClock, FileText } from "lucide-react";
import { DatePickerField } from "@/components/ui/date-picker";
import { formatDealDateCountdown, formatDealDateShort } from "@/components/crm/deals/deals-helpers";
import { formatCLP, formatUFSuffix } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  amountClp: number;
  amountUf: number;
  totalGuards: number;
  activeQuote: { code: string | null; statusLabel: string } | null;
  expectedCloseDate: string | null;
  fechaEntrega?: string | null;
  isLicitacion?: boolean;
  nextStep: string | null;
  canEdit?: boolean;
  onCloseDateChange: (ymd: string) => void;
  onFechaEntregaChange?: (ymd: string) => void;
  onNextStepChange: (value: string) => void;
};

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[7.4rem] shrink-0 flex-col justify-center px-3 first:pl-1 lg:min-w-[8.5rem] lg:px-3.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
        {label}
      </span>
      <span className="mt-0.5 truncate font-mono text-[13px] font-semibold leading-tight tabular-nums lg:font-sans lg:text-[15px]">
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
  fechaEntrega,
  isLicitacion = false,
  nextStep,
  canEdit = true,
  onCloseDateChange,
  onFechaEntregaChange,
  onNextStepChange,
}: Props) {
  const dateYmd = isLicitacion
    ? (fechaEntrega?.slice(0, 10) ?? null)
    : (expectedCloseDate?.slice(0, 10) ?? null);
  const dateLabel = isLicitacion ? "Entrega de oferta" : "Cierre estimado";
  const countdown = isLicitacion ? formatDealDateCountdown(dateYmd) : null;
  const short = dateYmd ? formatDealDateShort(dateYmd) : null;

  function handleDateChange(ymd: string | null) {
    if (!ymd) return;
    if (isLicitacion) onFechaEntregaChange?.(ymd);
    else onCloseDateChange(ymd);
  }

  const countdownClass =
    countdown?.variant === "danger"
      ? "text-status-danger-fg"
      : countdown?.variant === "warn"
        ? "text-status-warn-fg"
        : "text-ds-text-3";

  const dateTrigger = (
    <button
      type="button"
      disabled={!canEdit}
      aria-label={dateLabel}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-md text-left sm:min-h-8",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !canEdit && "cursor-default",
      )}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
      {short ? (
        <span className="inline-flex items-baseline gap-1.5">
          <span>{short}</span>
          {countdown ? (
            <span className={cn("text-[12px] font-medium", countdownClass)}>
              {countdown.text}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-[13px] font-normal text-ds-text-3">Definir</span>
      )}
    </button>
  );

  return (
    <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-thin divide-x divide-ds-border-subtle px-1">
      <Item label="Monto mensual">
        {amountClp > 0 ? (
          <span className="text-status-ok-fg">{formatCLP(amountClp)}</span>
        ) : (
          <span className="font-sans text-[13px] font-normal text-ds-text-3">—</span>
        )}
      </Item>
      <Item label="UF">
        {amountUf > 0 ? (
          <span className="text-status-info-fg">{formatUFSuffix(amountUf)}</span>
        ) : (
          <span className="font-sans text-[13px] font-normal text-ds-text-3">—</span>
        )}
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
      <Item label={dateLabel}>
        {canEdit ? (
          <DatePickerField
            asChild
            value={dateYmd}
            onChange={handleDateChange}
            aria-label={dateLabel}
          >
            {dateTrigger}
          </DatePickerField>
        ) : short ? (
          <span className="inline-flex items-baseline gap-1.5">
            {short}
            {countdown ? (
              <span className={cn("text-[12px] font-medium", countdownClass)}>{countdown.text}</span>
            ) : null}
          </span>
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
