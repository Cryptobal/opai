"use client";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import { fmtCompact } from "./cashflow-mobile-3w-helpers";

type Tone = "income" | "expense" | "saldo" | "subcat" | "client";

interface Props {
  label: string;
  tone: Tone;
  values?: [number, number, number];
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  installationCount?: number;
}

const TONE: Record<Tone, { bg: string; fg: string; labelClass: string }> = {
  income:  { bg: "bg-status-ok-bg/15",   fg: "text-status-ok-fg",   labelClass: "font-semibold" },
  expense: { bg: "bg-status-warn-bg/15", fg: "text-status-warn-fg", labelClass: "font-semibold" },
  saldo:   { bg: "bg-muted/40",          fg: "text-ds-text-1",      labelClass: "font-semibold text-ds-text-2" },
  subcat:  { bg: "bg-muted/15",          fg: "text-ds-text-2",      labelClass: "font-medium text-ds-text-2" },
  client:  { bg: "bg-muted/20",          fg: "",                    labelClass: "" },
};

export function CashflowMobileWeeklyBand({
  label, tone, values, collapsible, expanded, onToggle, installationCount,
}: Props) {
  const t = TONE[tone];

  if (tone === "client") {
    return (
      <div
        className={`grid items-center px-2 py-1 ${t.bg} border-b border-border/50`}
        style={{ gridTemplateColumns: "minmax(0, 1.5fr) repeat(3, minmax(0, 1fr))" }}
      >
        <div className="col-span-4 flex items-center gap-1.5 pl-2 min-w-0">
          <Building2 className="h-3 w-3 text-ds-text-3 shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-medium text-ds-text-2 tracking-[0.04em] uppercase truncate">
            {label}
          </span>
          {installationCount !== undefined && (
            <span className="text-[10px] text-ds-text-3 shrink-0">
              &middot; {installationCount} inst.
            </span>
          )}
        </div>
      </div>
    );
  }

  const vals: [number, number, number] = values ?? [0, 0, 0];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={`grid items-center px-2 py-1.5 ${t.bg} border-b border-border/50`}
      style={{ gridTemplateColumns: "minmax(0, 1.5fr) repeat(3, minmax(0, 1fr))" }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.04em] ${t.labelClass} ${t.fg}`}
        >
          <Chevron className="h-3 w-3" aria-hidden="true" />
          {label}
        </button>
      ) : (
        <span className={`text-[10px] uppercase tracking-[0.04em] ${t.labelClass} ${t.fg}`}>
          {label}
        </span>
      )}
      {vals.map((v, i) => (
        <div
          key={i}
          className={`text-right text-[10px] tabular-nums ${t.fg} ${t.labelClass} ${
            i === 1 ? "bg-status-info-bg/10 px-1 rounded-sm" : ""
          }`}
        >
          {v === 0 ? "—" : fmtCompact(v)}
        </div>
      ))}
    </div>
  );
}
