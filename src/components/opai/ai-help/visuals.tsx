"use client";

import { memo, useEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  VisualBlock,
  VisualCardItem,
  VisualChart,
  VisualKpi,
  VisualSuggestionItem,
  VisualTable,
} from "@/lib/ai/help-chat-visual-types";
import { SuggestionIconEl } from "./message-render";

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const MiniBarChart = memo(function MiniBarChart({ chart }: { chart: VisualChart }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = 320;
  const h = 160;
  const pad = { t: 16, r: 12, b: 28, l: 36 };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, w, h);

    const labels = chart.labels;
    const datasets = chart.datasets;
    if (labels.length === 0 || datasets.length === 0) return;

    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const maxVal = Math.max(
      1,
      ...datasets.flatMap((ds) => ds.data.map((n) => Math.abs(Number(n) || 0))),
    );

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let g = 0; g <= 4; g += 1) {
      const y = pad.t + (innerH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }

    const groupW = innerW / labels.length;
    const barSlot = groupW * 0.7;
    const barW = barSlot / Math.max(1, datasets.length);

    labels.forEach((_, li) => {
      const gx = pad.l + li * groupW + groupW * 0.15;
      datasets.forEach((ds, di) => {
        const val = Number(ds.data[li] ?? 0);
        const bh = (val / maxVal) * innerH;
        const x = gx + di * barW;
        const y = pad.t + innerH - bh;
        const color = ds.color || CHART_COLORS[di % CHART_COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, barW * 0.92, bh);
      });
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "10px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[li].slice(0, 8), pad.l + li * groupW + groupW / 2, h - 8);
    });

    if (chart.title) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "11px system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(chart.title, pad.l, 12);
    }
  }, [chart]);

  return <canvas ref={ref} className="max-w-full rounded-lg" />;
});

const MiniLineChart = memo(function MiniLineChart({ chart }: { chart: VisualChart }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = 320;
  const h = 140;
  const pad = { t: 20, r: 12, b: 24, l: 32 };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, w, h);

    const labels = chart.labels;
    const ds = chart.datasets[0];
    if (!ds || labels.length < 2) return;
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const maxVal = Math.max(1, ...ds.data.map((n) => Math.abs(Number(n) || 0)));

    const stepX = innerW / Math.max(1, labels.length - 1);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let g = 0; g <= 4; g += 1) {
      const y = pad.t + (innerH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }

    const color = ds.color || CHART_COLORS[0];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ds.data.forEach((v, i) => {
      const x = pad.l + i * stepX;
      const y = pad.t + innerH - (Number(v) / maxVal) * innerH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ds.data.forEach((v, i) => {
      const x = pad.l + i * stepX;
      const y = pad.t + innerH - (Number(v) / maxVal) * innerH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    labels.forEach((lab, i) => {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "9px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lab.slice(0, 6), pad.l + i * stepX, h - 6);
    });
  }, [chart]);

  return <canvas ref={ref} className="max-w-full rounded-lg" />;
});

const MiniPieChart = memo(function MiniPieChart({ chart, donut }: { chart: VisualChart; donut: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = 220;
  const h = 160;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const ds = chart.datasets[0];
    const vals = (ds?.data ?? []).map((n) => Math.max(0, Number(n) || 0));
    const labels = chart.labels;
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = w * 0.38;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    const rIn = donut ? r * 0.55 : 0;
    let ang = -Math.PI / 2;

    vals.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, ang, ang + slice);
      ctx.closePath();
      ctx.fillStyle = ds?.color || CHART_COLORS[i % CHART_COLORS.length];
      ctx.fill();
      ang += slice;
    });

    if (donut && rIn > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, rIn, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(26,26,46,0.98)";
      ctx.fill();
    }

    let lx = w * 0.58;
    let ly = 24;
    labels.forEach((lab, i) => {
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fillRect(lx, ly - 8, 8, 8);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "10px system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${lab.slice(0, 14)} (${vals[i] ?? 0})`, lx + 12, ly);
      ly += 16;
    });
  }, [chart, donut]);

  return <canvas ref={ref} className="max-w-full rounded-lg" />;
});

function ChartRenderer({ chart }: { chart: VisualChart }) {
  if (chart.chartType === "line") return <MiniLineChart chart={chart} />;
  if (chart.chartType === "pie") return <MiniPieChart chart={chart} donut={false} />;
  if (chart.chartType === "donut") return <MiniPieChart chart={chart} donut />;
  return <MiniBarChart chart={chart} />;
}

function KpiBlock({ kpi }: { kpi: VisualKpi }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {kpi.items.slice(0, 8).map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
        >
          <p className="text-[10px] uppercase tracking-wide text-white/50">{item.label}</p>
          <p className="text-lg font-semibold text-white tabular-nums">{item.value}</p>
          {item.delta ? (
            <p
              className={cn(
                "text-xs flex items-center gap-0.5 mt-0.5",
                item.deltaDirection === "down" && "text-status-danger-fg",
                item.deltaDirection === "up" && "text-status-ok-fg",
                (!item.deltaDirection || item.deltaDirection === "neutral") && "text-white/50",
              )}
            >
              {item.deltaDirection === "up" ? (
                <ArrowUp className="h-3 w-3" />
              ) : item.deltaDirection === "down" ? (
                <ArrowDown className="h-3 w-3" />
              ) : null}
              {item.delta}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const CardsBlock = memo(function CardsBlock({
  items,
  onAction,
}: {
  items: VisualCardItem[];
  onAction: (a: VisualCardItem["action"] | undefined) => void;
}) {
  const visible = items.slice(0, 12);
  // Un solo item: layout vertical full-width (comportamiento anterior).
  // 2+ items: carrusel horizontal con snap y CTA explícito.
  if (visible.length <= 1) {
    return (
      <div className="mt-2 space-y-1.5">
        {visible.map((item, i) => {
          const isPendingConfirm = item.badge === "Pendiente confirmación";
          if (isPendingConfirm) {
            return (
              <div
                key={`${item.title}-${i}`}
                className="rounded-xl border border-tint-violet/40 bg-white/[0.04] px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    {item.subtitle ? <p className="text-xs text-white/50 truncate">{item.subtitle}</p> : null}
                    {item.meta ? <p className="text-xs text-white/70 truncate mt-0.5">{item.meta}</p> : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-tint-violet text-tint-violet-fg px-2 py-0.5 text-[10px] font-medium">
                    {item.badge}
                  </span>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAction({ type: "query", message: "Sí, crear el borrador ahora" })}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-status-info to-status-ok px-3 py-1.5 text-xs font-medium text-white shadow-[0_4px_12px_rgba(16,185,129,0.25)] hover:brightness-110 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirmar y crear
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction({ type: "query", message: "Cancelar, no crear" })}
                    className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          }
          return (
            <button
              key={`${item.title}-${i}`}
              type="button"
              onClick={() => item.action && onAction(item.action)}
              className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{item.title}</p>
                {item.subtitle ? <p className="text-xs text-white/50 truncate">{item.subtitle}</p> : null}
                {item.meta ? <p className="text-xs text-white/70 truncate mt-0.5">{item.meta}</p> : null}
              </div>
              {item.badge ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    item.badgeColor === "green" && "bg-status-ok-soft text-status-ok-fg",
                    item.badgeColor === "red" && "bg-status-danger-soft text-status-danger-fg",
                    item.badgeColor === "blue" && "bg-status-info-soft text-status-info-fg",
                    (item.badgeColor === "purple" || item.badgeColor === "violet") && "bg-tint-violet text-tint-violet-fg",
                    (!item.badgeColor || item.badgeColor === "amber" || item.badgeColor === "yellow") && "bg-status-warn-soft text-status-warn-fg",
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mt-2 -mx-3 px-3">
      <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:thin]">
        {visible.map((item, i) => (
          <div
            key={`${item.title}-${i}`}
            className="group relative flex min-w-[220px] max-w-[240px] snap-start flex-col rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
          >
            <div className="flex items-start gap-2">
              <p className="text-sm font-semibold text-white line-clamp-2 flex-1">{item.title}</p>
              {item.badge ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    item.badgeColor === "green" && "bg-status-ok-soft text-status-ok-fg",
                    item.badgeColor === "red" && "bg-status-danger-soft text-status-danger-fg",
                    item.badgeColor === "blue" && "bg-status-info-soft text-status-info-fg",
                    item.badgeColor === "purple" && "bg-tint-violet text-tint-violet-fg",
                    (!item.badgeColor || item.badgeColor === "amber" || item.badgeColor === "yellow") && "bg-status-warn-soft text-status-warn-fg",
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </div>
            {item.subtitle ? (
              <p className="mt-1 text-[11px] leading-snug text-white/55 line-clamp-2">{item.subtitle}</p>
            ) : null}
            {item.meta ? (
              <p className="mt-1.5 text-xs font-medium text-white/85 truncate">{item.meta}</p>
            ) : null}
            {item.action ? (
              <button
                type="button"
                onClick={() => onAction(item.action)}
                className="mt-3 inline-flex items-center justify-center gap-1 rounded-lg bg-white/[0.06] border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-white/90 hover:bg-white/[0.12] transition"
              >
                Ver detalle
                <ChevronRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
});

const TableBlock = memo(function TableBlock({ table }: { table: VisualTable }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-white/[0.08]">
      {table.title ? <p className="px-3 py-2 text-xs font-medium text-white/70 border-b border-white/[0.06]">{table.title}</p> : null}
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-white/[0.06] text-white/50">
            {table.headers.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, 8).map((row, ri) => (
            <tr key={ri} className="border-b border-white/[0.04] text-white/85">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1.5 whitespace-nowrap max-w-[140px] truncate">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function SuggestionsBlock({
  items,
  onAction,
}: {
  items: VisualSuggestionItem[];
  onAction: (a: VisualSuggestionItem["action"]) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((s, i) => (
        <button
          key={`${s.label}-${i}`}
          type="button"
          onClick={() => onAction(s.action)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-status-info-soft to-status-ok-soft border border-status-info-border px-3 py-1.5 text-xs font-medium text-status-info-fg hover:brightness-110 transition"
        >
          <SuggestionIconEl icon={s.icon} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function VisualsRenderer({
  visuals,
  suggestions,
  onCardAction,
  onSuggestionAction,
}: {
  visuals: VisualBlock[];
  suggestions: VisualSuggestionItem[];
  onCardAction: (a: VisualCardItem["action"] | undefined) => void;
  onSuggestionAction: (a: VisualSuggestionItem["action"]) => void;
}) {
  // Dedup: si una suggestion apunta a la misma URL que ya navega una card,
  // ocultá la suggestion para evitar el doble CTA "ver detalle / ver borrador".
  const cardNavigateUrls = new Set<string>();
  for (const v of visuals) {
    if (v.kind !== "cards") continue;
    for (const it of v.items) {
      if (it.action?.type === "navigate") cardNavigateUrls.add(it.action.url);
    }
  }
  const filteredSuggestions = suggestions.filter((s) => {
    if (s.action.type !== "navigate") return true;
    return !cardNavigateUrls.has(s.action.url);
  });
  return (
    <div className="mt-2 space-y-2">
      {visuals.map((v, i) => {
        if (v.kind === "chart") {
          return (
            <div key={`v-${i}`} className="rounded-xl border border-white/[0.08] bg-black/20 p-2">
              <ChartRenderer chart={v} />
            </div>
          );
        }
        if (v.kind === "kpi") return <KpiBlock key={`v-${i}`} kpi={v} />;
        if (v.kind === "cards") return <CardsBlock key={`v-${i}`} items={v.items} onAction={onCardAction} />;
        if (v.kind === "table") return <TableBlock key={`v-${i}`} table={v} />;
        return null;
      })}
      {filteredSuggestions.length > 0 ? (
        <SuggestionsBlock items={filteredSuggestions} onAction={onSuggestionAction} />
      ) : null}
    </div>
  );
}
