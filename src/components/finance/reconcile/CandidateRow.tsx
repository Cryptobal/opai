"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export interface CandidateRowProps {
  selected: boolean;
  onToggle: () => void;
  /** Línea 1 izquierda: folio / tipo */
  title: string;
  /** Línea 1 derecha / contraparte */
  counterparty: string;
  badges?: Array<{
    label: string;
    variant?: "brand" | "ok" | "warn" | "danger" | "info" | "neutral";
  }>;
  /** Línea 3: código cesión, instalación, etc. */
  meta?: string;
  amount: number;
  /** Bruto tachado cuando difiere del monto a girar */
  strikeAmount?: number | null;
  suggested?: boolean;
}

export function CandidateRow({
  selected,
  onToggle,
  title,
  counterparty,
  badges = [],
  meta,
  amount,
  strikeAmount,
  suggested = false,
}: CandidateRowProps) {
  const showStrike =
    strikeAmount != null && Math.abs(strikeAmount - amount) > 1;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full flex items-start gap-3 rounded-lg border p-3 text-left min-h-11",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary bg-primary/5"
          : suggested
            ? "border-primary/50 bg-primary/[0.04]"
            : "border-ds-border-default hover:bg-ds-surface-2",
      )}
    >
      <div className="shrink-0 pt-0.5">
        {selected ? (
          <CheckCircle2 className="h-5 w-5 text-primary" />
        ) : (
          <Circle className="h-5 w-5 text-ds-text-3" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium text-ds-text-1 truncate">
            {title}
            {counterparty ? (
              <span className="font-normal text-ds-text-2">
                {" · "}
                {counterparty}
              </span>
            ) : null}
          </p>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((b, i) => (
              <Tag key={i} variant={b.variant ?? "neutral"} size="sm">
                {b.label}
              </Tag>
            ))}
          </div>
        )}
        {meta ? (
          <p className="text-[12px] text-ds-text-3 truncate">{meta}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-mono font-medium tabular-nums text-ds-text-1">
          {fmtCLP.format(amount)}
        </p>
        {showStrike ? (
          <p className="text-[12px] font-mono text-ds-text-3 line-through tabular-nums">
            {fmtCLP.format(strikeAmount!)}
          </p>
        ) : null}
      </div>
    </button>
  );
}
