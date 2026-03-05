"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/components/cpq/utils";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

interface MarginSectionProps {
  marginPct: number;
  onMarginChange: (margin: number) => void;
  marginAmount: number;
  isLocked?: boolean;
}

const PRESETS = [8, 10, 13, 15, 18, 20];

function marginColor(pct: number) {
  if (pct >= 15) return { border: "border-emerald-500", text: "text-emerald-500", ring: "focus:ring-emerald-500/30" };
  if (pct >= 10) return { border: "border-amber-500", text: "text-amber-500", ring: "focus:ring-amber-500/30" };
  return { border: "border-red-500", text: "text-red-500", ring: "focus:ring-red-500/30" };
}

export default function MarginSection({
  marginPct,
  onMarginChange,
  marginAmount,
  isLocked = false,
}: MarginSectionProps) {
  const [sliderValue, setSliderValue] = useState(marginPct);
  const [inputDraft, setInputDraft] = useState(formatNumber(marginPct, { minDecimals: 1, maxDecimals: 1 }));

  // Sync local state when parent value changes
  useEffect(() => {
    setSliderValue(marginPct);
    setInputDraft(formatNumber(marginPct, { minDecimals: 1, maxDecimals: 1 }));
  }, [marginPct]);

  const colors = marginColor(sliderValue);

  function commitInput() {
    const parsed = parseLocalizedNumber(inputDraft || "0");
    const clamped = Math.min(30, Math.max(0, parsed));
    setInputDraft(formatNumber(clamped, { minDecimals: 1, maxDecimals: 1 }));
    setSliderValue(clamped);
    if (clamped !== marginPct) {
      onMarginChange(clamped);
    }
  }

  return (
    <Card className="p-4">
      {/* Header + presets */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[17px] font-bold tracking-tight">Margen de venta</h3>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={isLocked}
              onClick={() => {
                setSliderValue(p);
                setInputDraft(formatNumber(p, { minDecimals: 1, maxDecimals: 1 }));
                onMarginChange(p);
              }}
              className={`h-7 min-w-[40px] rounded-md border px-1.5 text-xs font-medium transition-colors
                ${sliderValue === p
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }
                disabled:pointer-events-none disabled:opacity-50`}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      {/* Slider + numeric input */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">0%</span>
        <input
          type="range"
          min={0}
          max={30}
          step={0.5}
          value={sliderValue}
          disabled={isLocked}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setSliderValue(v);
            setInputDraft(formatNumber(v, { minDecimals: 1, maxDecimals: 1 }));
          }}
          onMouseUp={() => {
            if (sliderValue !== marginPct) onMarginChange(sliderValue);
          }}
          onTouchEnd={() => {
            if (sliderValue !== marginPct) onMarginChange(sliderValue);
          }}
          className="flex-1 h-2 accent-emerald-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">30%</span>

        <div className="flex items-center gap-1 shrink-0">
          <input
            type="text"
            inputMode="decimal"
            value={inputDraft}
            disabled={isLocked}
            onChange={(e) => setInputDraft(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            className={`h-8 w-16 rounded-md border bg-card/80 px-2 text-center text-sm font-semibold
              ${colors.border} ${colors.text} ${colors.ring}
              focus:outline-none focus:ring-2
              disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          <span className={`text-sm font-semibold ${colors.text}`}>%</span>
        </div>
      </div>

      {/* Margin amount */}
      <div className="mt-2 text-center">
        <span className="text-xs text-muted-foreground">
          = <span className="font-mono font-semibold">{formatCurrency(marginAmount)}</span> margen
        </span>
      </div>
    </Card>
  );
}
