"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface TePeriodSelectorProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onExport?: () => void;
  exporting?: boolean;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function TePeriodSelector({
  from,
  to,
  onFromChange,
  onToChange,
  onExport,
  exporting,
}: TePeriodSelectorProps) {
  const presets = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();

    const prevMonthStart = new Date(Date.UTC(y, m - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(y, m, 0));
    const currMonthStart = new Date(Date.UTC(y, m, 1));
    const yearStart = new Date(Date.UTC(y, 0, 1));

    return [
      { label: "Mes anterior", from: toDateStr(prevMonthStart), to: toDateStr(prevMonthEnd) },
      { label: "Mes actual", from: toDateStr(currMonthStart), to: toDateStr(now) },
      { label: "Acumulado año", from: toDateStr(yearStart), to: toDateStr(now) },
    ];
  }, []);

  const isActive = (p: { from: string; to: string }) => p.from === from && p.to === to;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => { onFromChange(p.from); onToChange(p.to); }}
          className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            isActive(p)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ml-auto">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
        />
        <span className="text-[11px] text-muted-foreground">a</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
        />
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            disabled={exporting}
            onClick={onExport}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "..." : "Excel"}
          </Button>
        )}
      </div>
    </div>
  );
}
