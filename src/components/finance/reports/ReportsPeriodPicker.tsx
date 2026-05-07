"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import type {
  FinanceReportPeriod,
  FinanceReportPeriodType,
} from "@/modules/finance/reports/shared/types";
import { buildPeriod } from "@/modules/finance/reports/shared/period.helper";

interface Props {
  value: FinanceReportPeriod;
  onChange: (p: FinanceReportPeriod) => void;
  showCompare?: boolean;
  compareEnabled?: boolean;
  onCompareToggle?: (v: boolean) => void;
}

const TYPES: { id: FinanceReportPeriodType; label: string }[] = [
  { id: "month", label: "Mes" },
  { id: "quarter", label: "Trimestre" },
  { id: "year", label: "Año" },
  { id: "ytd", label: "YTD" },
  { id: "custom", label: "Personalizado" },
];

export function ReportsPeriodPicker({
  value,
  onChange,
  showCompare,
  compareEnabled,
  onCompareToggle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);

  const handleType = (type: FinanceReportPeriodType) => {
    if (type === "custom") {
      onChange(buildPeriod("custom", new Date(), { from: customFrom, to: customTo }));
    } else {
      onChange(buildPeriod(type, new Date()));
    }
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12.5px] font-medium border bg-ds-surface text-ds-text-1"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <Calendar className="w-3.5 h-3.5" />
        <span>{value.label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {showCompare && (
        <button
          type="button"
          onClick={() => onCompareToggle?.(!compareEnabled)}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12.5px] font-medium border"
          style={{
            borderColor: compareEnabled ? "var(--ds-tint-violet)" : "var(--ds-border)",
            background: compareEnabled
              ? "color-mix(in oklab, var(--ds-tint-violet) 15%, transparent)"
              : "var(--ds-surface)",
            color: compareEnabled ? "var(--ds-tint-violet)" : "var(--ds-text-2)",
          }}
        >
          vs. período anterior
        </button>
      )}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 w-72 rounded-lg border p-3 shadow-2xl"
          style={{ background: "var(--ds-surface-2)", borderColor: "var(--ds-border)" }}
        >
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleType(t.id)}
                className="px-2 py-1.5 rounded text-[12px] border text-ds-text-2"
                style={{ borderColor: "var(--ds-border)", background: "var(--ds-surface)" }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {value.type === "custom" && (
            <div className="space-y-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full h-8 rounded border px-2 text-[12px] bg-ds-surface"
                style={{ borderColor: "var(--ds-border)" }}
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full h-8 rounded border px-2 text-[12px] bg-ds-surface"
                style={{ borderColor: "var(--ds-border)" }}
              />
              <button
                onClick={() => handleType("custom")}
                className="w-full h-8 rounded text-[12px] font-medium text-white"
                style={{ background: "var(--ds-tint-sky)" }}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
