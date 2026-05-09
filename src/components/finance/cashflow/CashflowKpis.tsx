"use client";
import { useState } from "react";
import { Surface } from "@/components/opai-ds";
import { ChevronDown } from "lucide-react";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

type ToneKey = "ok" | "info" | "warn";
type IconKey = "wallet" | "up" | "down" | "alert";

export interface KpiData {
  label: string;
  value: string;
  tone: ToneKey;
  icon: IconKey;
  sub: string;
}

const TONE: Record<ToneKey, { bg: string; fg: string }> = {
  ok: { bg: "bg-status-ok-soft", fg: "text-status-ok-fg" },
  info: { bg: "bg-status-info-soft", fg: "text-status-info-fg" },
  warn: { bg: "bg-status-warn-soft", fg: "text-status-warn-fg" },
};

const ICONS = {
  wallet: Wallet,
  up: TrendingUp,
  down: TrendingDown,
  alert: AlertTriangle,
};

export function CashflowKpis({ kpis }: { kpis: KpiData[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? kpis : kpis.slice(0, 2);
  const hidden = kpis.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {/* Mobile shows only first 2 unless expanded; sm+ always shows all */}
        {kpis.map((k, idx) => {
          const Icon = ICONS[k.icon];
          const tone = TONE[k.tone];
          const hideOnMobile = !expanded && idx >= 2;
          return (
            <Surface
              key={k.label}
              elevation={1}
              padding="md"
              className={hideOnMobile ? "hidden sm:block" : ""}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-ds-md shrink-0 ${tone.bg} ${tone.fg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                    {k.label}
                  </p>
                  <p className="font-display text-xl font-semibold text-ds-text-1 ds-num mt-1 truncate">
                    {k.value}
                  </p>
                  <p className="text-[12px] text-ds-text-3 mt-0.5 truncate">{k.sub}</p>
                </div>
              </div>
            </Surface>
          );
        })}
      </div>

      {/* Toggle: only visible on mobile when there are more than 2 KPIs */}
      {kpis.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="sm:hidden w-full flex items-center justify-center gap-1.5 py-2 rounded-ds-md text-[13px] text-ds-text-2 hover:text-ds-text-1 hover:bg-muted/30 transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Ocultar KPIs" : `Ver ${hidden} KPI${hidden > 1 ? "s" : ""} más`}
        </button>
      )}
    </div>
  );
}
