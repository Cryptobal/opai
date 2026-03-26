"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/components/cpq/utils";
import { cn, formatNumber, parseLocalizedNumber } from "@/lib/utils";
import type { MarginMode } from "@/types/cpq";

interface MarginSectionProps {
  marginPct: number;
  onMarginChange: (margin: number) => void;
  marginAmount: number;
  isLocked?: boolean;
  marginMode?: MarginMode;
  onMarginModeChange?: (mode: MarginMode) => void;
}

const PRESETS = [8, 10, 13, 15, 18, 20];

const MARGIN_MODES: { value: MarginMode; label: string }[] = [
  { value: "margin_on_sale", label: "Sobre venta" },
  { value: "markup", label: "Markup" },
  { value: "margin_on_labor", label: "Solo M.O." },
];

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
  marginMode = "margin_on_sale",
  onMarginModeChange,
}: MarginSectionProps) {
  const [sliderValue, setSliderValue] = useState(marginPct);
  const [inputDraft, setInputDraft] = useState(formatNumber(marginPct, { minDecimals: 1, maxDecimals: 1 }));

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
    <Card className="p-3">
      {/* Header: title + mode chips */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2.5">
        <h3 className="text-[13px] font-bold tracking-tight">Margen</h3>
        <div className="flex gap-1">
          {MARGIN_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={isLocked}
              onClick={() => onMarginModeChange?.(m.value)}
              className={cn(
                "h-6 rounded-md border px-2 text-xs font-semibold transition-colors",
                marginMode === m.value
                  ? "border-emerald-500 bg-emerald-500 text-emerald-950"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="flex gap-1 mb-2">
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
            className={cn(
              "h-7 min-w-[40px] rounded-md border px-1.5 text-xs font-bold transition-colors",
              sliderValue === p
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {p}%
          </button>
        ))}
      </div>

      {/* Slider + numeric input */}
      <div className="flex items-center gap-3">
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
          className="flex-1 h-1.5 accent-emerald-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />

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
            className={cn(
              "h-8 w-16 rounded-md border bg-card/80 px-2 text-center text-sm font-semibold",
              colors.border, colors.text, colors.ring,
              "focus:outline-none focus:ring-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <span className={cn("text-sm font-semibold", colors.text)}>%</span>
        </div>
      </div>

      {/* Margin amount */}
      <div className="mt-1.5 text-right">
        <span className="text-xs text-emerald-500 font-semibold">
          = {formatCurrency(marginAmount)} margen mensual
        </span>
      </div>
    </Card>
  );
}
