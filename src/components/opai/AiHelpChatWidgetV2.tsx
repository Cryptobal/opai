"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronRight,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Users,
  X,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  VisualBlock,
  VisualChart,
  VisualCardItem,
  VisualKpi,
  VisualSuggestionItem,
  VisualTable,
  SuggestionIcon,
} from "@/lib/ai/help-chat-visual-types";
import {
  useChatPageContext,
  useClearChatPageContext,
  type ChatPageContextValue,
} from "./ChatPageContextProvider";

type ConversationItem = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  visuals?: VisualBlock[];
  suggestions?: VisualSuggestionItem[];
};

const MAX_VISIBLE_MESSAGES = 120;
const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function SuggestionIconEl({ icon }: { icon?: SuggestionIcon }) {
  switch (icon) {
    case "users":
      return <Users className="h-3.5 w-3.5" />;
    case "calendar":
      return <Calendar className="h-3.5 w-3.5" />;
    case "sparkles":
      return <Sparkles className="h-3.5 w-3.5" />;
    case "link":
      return <Link2 className="h-3.5 w-3.5" />;
    case "chart":
    default:
      return <BarChart3 className="h-3.5 w-3.5" />;
  }
}

function MiniBarChart({ chart }: { chart: VisualChart }) {
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
}

function MiniLineChart({ chart }: { chart: VisualChart }) {
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
}

function MiniPieChart({ chart, donut }: { chart: VisualChart; donut: boolean }) {
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
}

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
                item.deltaDirection === "down" && "text-rose-400",
                item.deltaDirection === "up" && "text-emerald-400",
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

function CardsBlock({
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
        {visible.map((item, i) => (
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
                  item.badgeColor === "green" && "bg-emerald-500/20 text-emerald-300",
                  item.badgeColor === "red" && "bg-rose-500/20 text-rose-300",
                  item.badgeColor === "blue" && "bg-sky-500/20 text-sky-300",
                  item.badgeColor === "purple" && "bg-violet-500/20 text-violet-300",
                  (!item.badgeColor || item.badgeColor === "amber" || item.badgeColor === "yellow") && "bg-amber-500/20 text-amber-200",
                )}
              >
                {item.badge}
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
          </button>
        ))}
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
                    item.badgeColor === "green" && "bg-emerald-500/20 text-emerald-300",
                    item.badgeColor === "red" && "bg-rose-500/20 text-rose-300",
                    item.badgeColor === "blue" && "bg-sky-500/20 text-sky-300",
                    item.badgeColor === "purple" && "bg-violet-500/20 text-violet-300",
                    (!item.badgeColor || item.badgeColor === "amber" || item.badgeColor === "yellow") && "bg-amber-500/20 text-amber-200",
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
}

function TableBlock({ table }: { table: VisualTable }) {
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
}

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
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500/25 to-emerald-500/20 border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:from-cyan-500/35 hover:to-emerald-500/30 transition"
        >
          <SuggestionIconEl icon={s.icon} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

function VisualsRenderer({
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
      {suggestions.length > 0 ? (
        <SuggestionsBlock items={suggestions} onAction={onSuggestionAction} />
      ) : null}
    </div>
  );
}

function renderBoldText(text: string, keyPrefix: string) {
  const nodes: Array<ReactElement | string> = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : text;
}

function linkifyLine(line: string) {
  const parts: Array<ReactElement | string> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match) {
    if (match.index > lastIndex) {
      const textPart = line.slice(lastIndex, match.index);
      const rendered = renderBoldText(textPart, `pre-${match.index}`);
      if (Array.isArray(rendered)) parts.push(...rendered);
      else parts.push(rendered);
    }

    const label = match[1];
    const markdownHref = match[2];
    const rawHref = match[3];
    const href = markdownHref ?? rawHref;
    const text = label ?? href.replace(/^https?:\/\//, "");

    if (href) {
      parts.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 text-cyan-300 hover:text-cyan-200"
        >
          {text}
        </a>,
      );
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(line);
  }

  if (lastIndex < line.length) {
    const textPart = line.slice(lastIndex);
    const rendered = renderBoldText(textPart, `post-${lastIndex}`);
    if (Array.isArray(rendered)) parts.push(...rendered);
    else parts.push(rendered);
  }

  return parts.length > 0 ? parts : line;
}

/**
 * Strip out visual block syntax (`:::cards ... :::`, `:::chart ... :::`, etc.)
 * from streaming text so the user doesn't see raw JSON while the model writes
 * the block. Removes both completed blocks AND the trailing partial block
 * (anything after an unmatched `:::xxx`). The server re-sends a clean text in
 * the final `done` event so the rendered bubble will look right when streaming
 * finishes.
 */
function stripVisualBlocks(content: string): string {
  const VISUAL_TYPES = "(chart|kpi|cards|table|suggestions)";
  // Remove fully closed blocks
  let out = content.replace(
    new RegExp(`:::${VISUAL_TYPES}\\s*\\n[\\s\\S]*?\\n:::`, "gi"),
    "",
  );
  // Remove trailing unclosed block (still streaming)
  out = out.replace(new RegExp(`:::${VISUAL_TYPES}[\\s\\S]*$`, "i"), "");
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function renderMessageContent(content: string) {
  const cleaned = stripVisualBlocks(content);
  const lines = cleaned.split("\n");
  return lines.map((line, idx) => (
    <Fragment key={`${idx}-${line.slice(0, 12)}`}>
      {linkifyLine(line)}
      {idx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

const TOOL_LABELS: Record<string, string> = {
  search_accounts: "Buscando clientes...",
  search_deals: "Buscando deals...",
  search_installations: "Buscando instalaciones...",
  search_quotes: "Buscando cotizaciones...",
  search_guardias: "Buscando guardias...",
  get_entity_documents: "Buscando documentos...",
  read_document: "Leyendo documento...",
  get_uf_utm: "Consultando UF/UTM...",
  get_guardias_metrics: "Calculando métricas...",
  get_pending_rendiciones: "Buscando rendiciones...",
  get_daily_attendance: "Consultando asistencia...",
  get_supervision_visits: "Consultando supervisión...",
  get_rondas_status: "Consultando rondas...",
  get_tickets_summary: "Consultando tickets...",
  get_finance_summary: "Consultando finanzas...",
  get_account_detail: "Leyendo ficha del cliente...",
  list_account_documents: "Listando documentos del cliente...",
  get_guardia_detail: "Leyendo ficha del guardia...",
  list_guardia_documents: "Listando documentos del guardia...",
  get_panic_alerts: "Revisando alertas de pánico...",
  get_daily_absences: "Revisando ausencias...",
  get_extra_shifts: "Revisando turnos extra...",
  get_deal_pipeline: "Cargando pipeline...",
  get_user_context: "Cargando contexto del usuario...",
  get_tenant_summary: "Cargando resumen del tenant...",
};

function friendlyToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? "Consultando datos...";
}

/**
 * Starters dinámicos: se adaptan a la entidad que el usuario está viendo
 * (pageContext) o, en su defecto, al módulo actual (pathname).
 * Fallback: starters genéricos.
 */
function getQuickStarters(
  pageContext: ChatPageContextValue | null,
  pathname: string | null,
): string[] {
  // 1) Contexto de página: prioridad máxima
  if (pageContext) {
    switch (pageContext.entityType) {
      case "crm_account":
        return [
          "Resúmeme este cliente",
          "¿Qué cotizaciones tiene?",
          "Lista sus contratos y documentos",
          "¿Cuál fue la última actividad?",
        ];
      case "crm_deal":
        return [
          "Resúmeme este deal",
          "¿En qué etapa está y cuál es el próximo paso?",
          "¿Qué cotizaciones tiene asociadas?",
          "¿Cuánto falta para el cierre esperado?",
        ];
      case "crm_installation":
        return [
          "Resúmeme esta instalación",
          "¿Quién es el supervisor asignado?",
          "¿Cuántos puestos y guardias tiene?",
          "¿Hay alertas recientes?",
        ];
      case "cpq_quote":
        return [
          "Resúmeme esta cotización",
          "¿Qué incluye el servicio?",
          "¿Cuándo vence y cuál es el monto mensual?",
          "Genera un resumen para enviar al cliente",
        ];
      case "ops_guardia":
        return [
          "Resúmeme este guardia",
          "¿Qué documentos tiene vigentes?",
          "¿Cómo ha sido su asistencia?",
          "¿Tiene turnos extra recientes?",
        ];
      case "doc_document":
        return [
          "Resúmeme este documento en 5 puntos",
          "¿Cuáles son las obligaciones principales?",
          "¿Qué montos y fechas clave menciona?",
          "¿Está vigente y quién lo firmó?",
        ];
      case "crm_contact":
        return [
          "Resúmeme este contacto",
          "¿Qué interacciones tiene registradas?",
          "¿A qué cuenta pertenece?",
          "Abre el correo para escribirle",
        ];
      default:
        break;
    }
  }

  // 2) Pathname: módulo actual
  const p = pathname ?? "";
  if (p.startsWith("/crm/leads") || p.startsWith("/crm/prospects")) {
    return [
      "¿Cómo creo un prospecto?",
      "Muéstrame los leads más recientes",
      "¿Cómo convierto un prospecto en cliente?",
      "Buscar prospecto por nombre",
    ];
  }
  if (p.startsWith("/crm/deals")) {
    return [
      "Resume el pipeline comercial",
      "¿Qué deals cierran esta semana?",
      "Lista los deals abiertos por etapa",
      "¿Cómo creo un deal nuevo?",
    ];
  }
  if (p.startsWith("/crm/cotizaciones") || p.startsWith("/cpq")) {
    return [
      "Lista las últimas cotizaciones enviadas",
      "¿Cómo clono una cotización?",
      "¿Qué cotizaciones están por vencer?",
      "Buscar cotización por código",
    ];
  }
  if (p.startsWith("/crm")) {
    return [
      "Busca un cliente por nombre",
      "¿Cómo creo una cuenta nueva?",
      "Resume el pipeline comercial",
      "Lista las últimas cotizaciones",
    ];
  }
  if (p.startsWith("/ops/rondas") || p.startsWith("/rondas")) {
    return [
      "Estado de rondas de hoy",
      "¿Hay alertas de checkpoints?",
      "¿Cómo creo una plantilla de rondas?",
      "Resume la supervisión de esta semana",
    ];
  }
  if (p.startsWith("/ops/pauta")) {
    return [
      "¿Cómo creo la pauta del mes?",
      "¿Cuántos PPC tengo hoy?",
      "Explícame cómo funciona un slot",
      "Diferencia entre pauta mensual y asistencia diaria",
    ];
  }
  if (p.startsWith("/ops/asistencia") || p.startsWith("/ops/marcacion")) {
    return [
      "Resume la asistencia de hoy",
      "¿Cuántas ausencias hubo?",
      "Turnos extra pendientes de aprobación",
      "¿Cómo funciona la marcación por QR?",
    ];
  }
  if (p.startsWith("/ops")) {
    return [
      "Resume el estado operativo de hoy",
      "¿Cuántos PPC tengo?",
      "¿Qué alertas de pánico hay recientes?",
      "¿Cómo configuro un puesto operativo?",
    ];
  }
  if (p.startsWith("/personas/guardias") || p.startsWith("/personas")) {
    return [
      "Buscar guardia por nombre o RUT",
      "Resume las métricas de guardias",
      "¿Qué documentos vencen pronto?",
      "¿Cómo doy de alta un guardia?",
    ];
  }
  if (p.startsWith("/finanzas") || p.startsWith("/finance")) {
    return [
      "¿Cuántas rendiciones hay pendientes?",
      "Resume las finanzas del último mes",
      "¿Cómo apruebo una rendición?",
      "¿Qué DTE están por vencer?",
    ];
  }
  if (p.startsWith("/docs")) {
    return [
      "¿Cómo genero un contrato?",
      "¿Cómo funciona la firma digital?",
      "Buscar documento por nombre",
      "Lista las plantillas disponibles",
    ];
  }
  if (p.startsWith("/payroll")) {
    return [
      "Explícame el simulador de sueldos",
      "¿Cuál es la UF y UTM de hoy?",
      "¿Cómo configuro parámetros de payroll?",
      "¿Cómo calculo el costo de un guardia?",
    ];
  }
  if (p.startsWith("/configuracion") || p.startsWith("/settings")) {
    return [
      "¿Cómo creo un rol nuevo?",
      "¿Qué permisos tiene mi usuario?",
      "Explícame la jerarquía de roles",
      "¿Cómo invito a un usuario?",
    ];
  }

  // 3) Fallback genérico
  return [
    "¿Qué puedes hacer?",
    "Resume el estado de operaciones de hoy",
    "¿Cuántas rendiciones hay pendientes?",
    "¿Cómo configuro rondas?",
  ];
}

export function AiHelpChatWidgetV2() {
  const [open, setOpen] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const pageContext = useChatPageContext();
  const clearPageContext = useClearChatPageContext();
  const pathname = usePathname();
  const quickStarters = useMemo(
    () => getQuickStarters(pageContext, pathname),
    [pageContext, pathname],
  );
  // Cuando una conversación nueva se crea durante un streaming, guardamos su id
  // aquí para que el useEffect que carga mensajes desde DB no clobere el estado
  // local mientras la respuesta del asistente aún no se persiste.
  const skipMessageFetchRef = useRef<string | null>(null);
  const scrollDesktopRef = useRef<HTMLDivElement | null>(null);
  const scrollMobileRef = useRef<HTMLDivElement | null>(null);
  const handleAction = (action: VisualCardItem["action"] | VisualSuggestionItem["action"] | undefined) => {
    if (!action) return;
    if (action.type === "navigate") {
      const url = action.url.startsWith("http") ? action.url : `${window.location.origin}${action.url}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action.type === "query") {
      void sendMessage(action.message);
    }
  };

  useEffect(() => {
    void (async () => {
      setLoadingConfig(true);
      try {
        const res = await fetch("/api/ai/help-chat/config");
        const text = await res.text();
        let json: { success?: boolean; data?: { canAccess?: boolean } };
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          setCanAccess(false);
          return;
        }
        if (json.success) {
          setCanAccess(Boolean(json.data?.canAccess));
        }
      } catch {
        setCanAccess(false);
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!canAccess || !open) return;
    void (async () => {
      try {
        const res = await fetch("/api/ai/help-chat/conversations");
        const text = await res.text();
        let json: { success?: boolean; data?: ConversationItem[]; persistenceEnabled?: boolean };
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          return;
        }
        if (json.success && Array.isArray(json.data)) {
          setConversations(json.data);
          setPersistenceEnabled(json.persistenceEnabled !== false);
          // Al abrir el panel siempre arrancamos en conversación nueva.
          // El historial queda accesible desde el selector superior.
          // Excepción: si el usuario ya tiene una conversación activa
          // en memoria (ej. porque no cerró el panel), se respeta.
          if (!activeConversationId && !isNewConversation) {
            setIsNewConversation(true);
            setMessages([]);
          }
        }
      } catch {
        // noop
      }
    })();
  }, [canAccess, open, activeConversationId, isNewConversation]);

  useEffect(() => {
    if (!canAccess || !activeConversationId || !open) return;
    // Si esta conversación se acaba de crear durante un streaming, no fetcheamos
    // sus mensajes desde DB: aún no están persistidos y haríamos clobber del
    // estado optimista (mensaje del usuario + asistente en streaming).
    if (skipMessageFetchRef.current === activeConversationId) {
      skipMessageFetchRef.current = null;
      return;
    }
    void (async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/ai/help-chat/conversations/${activeConversationId}`);
        const text = await res.text();
        let json: { success?: boolean; data?: { messages?: ChatMessage[] } };
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          setMessages([]);
          return;
        }
        if (json.success && json.data?.messages) {
          setMessages((json.data.messages as ChatMessage[]).slice(-MAX_VISIBLE_MESSAGES));
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [canAccess, activeConversationId, open]);

  useEffect(() => {
    const el = scrollDesktopRef.current || scrollMobileRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const startNewConversation = () => {
    setActiveConversationId(null);
    setIsNewConversation(true);
    setMessages([]);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setStreamingStarted(false);

    const optimisticUser: ChatMessage = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const streamingAssistant: ChatMessage = {
      id: `tmp-streaming-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser, streamingAssistant].slice(-MAX_VISIBLE_MESSAGES));
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/ai/help-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId ?? undefined,
          pageContext: pageContext ?? undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errorJson: { error?: string };
        try {
          errorJson = errText ? JSON.parse(errText) : {};
        } catch {
          errorJson = { error: "Error de conexión" };
        }
        throw new Error(errorJson.error || "No se pudo enviar el mensaje");
      }

      if (!res.body) throw new Error("No se recibió respuesta del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;

              if (eventType === "meta") {
                if (data.conversationId) {
                  const newId = String(data.conversationId);
                  // Marcamos este id para que el useEffect no fetchee mensajes
                  // desde DB y borre el estado optimista mientras streameamos.
                  if (newId !== activeConversationId) {
                    skipMessageFetchRef.current = newId;
                  }
                  setActiveConversationId(newId);
                  setIsNewConversation(false);
                }
                setPersistenceEnabled(data.persistenceEnabled !== false);
              } else if (eventType === "token") {
                if (!streamingStarted) setStreamingStarted(true);
                streamedText += (data.token as string) || "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: streamedText };
                  }
                  return updated;
                });
              } else if (eventType === "done") {
                const finalText = (data.assistantText as string) || streamedText;
                const visuals = (data.visuals as VisualBlock[] | undefined) ?? [];
                const suggestions = (data.suggestions as VisualSuggestionItem[] | undefined) ?? [];
                const msgId = (data.assistantMessageId as string) || `done-${Date.now()}`;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.findIndex(
                    (m) => m.role === "assistant" && m.id.startsWith("tmp-streaming-"),
                  );
                  if (lastIdx !== -1) {
                    updated[lastIdx] = {
                      id: msgId,
                      role: "assistant",
                      content: finalText,
                      visuals,
                      suggestions,
                      createdAt: new Date().toISOString(),
                    };
                  }
                  return updated;
                });
              } else if (eventType === "tool_call") {
                const status = (data.status as string) || "running";
                const name = (data.name as string) || "";
                if (status === "running") setActiveToolName(name);
                else setActiveToolName(null);
              } else if (eventType === "error") {
                throw new Error((data.error as string) || "Error del asistente");
              }
            } catch (parseError) {
              if (eventType === "error") {
                throw parseError;
              }
            }
            eventType = "";
          }
        }
      }

      const listRes = await fetch("/api/ai/help-chat/conversations");
      const listText = await listRes.text();
      try {
        const listJson = listText ? JSON.parse(listText) : {};
        if (listJson.success && Array.isArray(listJson.data)) {
          setConversations(listJson.data);
          setPersistenceEnabled(listJson.persistenceEnabled !== false);
        }
      } catch {
        // ignore
      }
    } catch (error) {
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => !(m.role === "assistant" && m.id.startsWith("tmp-streaming-") && !m.content),
        );
        return [
          ...filtered,
          {
            id: `tmp-error-${Date.now()}`,
            role: "assistant",
            content: (error as Error).message || "Ocurrió un error al responder. Intenta nuevamente.",
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } finally {
      setSending(false);
      setActiveToolName(null);
    }
  };

  if (loadingConfig || !canAccess) return null;

  const panelShell = (mobile: boolean) => (
    <>
      <div
        className={cn(
          "flex items-center justify-between border-b border-white/[0.08] px-4 py-3 bg-gradient-to-r from-cyan-500/15 via-emerald-500/10 to-indigo-500/15",
        )}
      >
        <div className="flex items-center gap-2 text-base font-semibold text-white">
          <Sparkles className="h-5 w-5 text-cyan-300" />
          OPAI Intelligence
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar asistente IA"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {pageContext ? (
        <div className="border-b border-cyan-500/20 px-3 py-2 bg-gradient-to-r from-cyan-500/10 to-emerald-500/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-cyan-300/70">Hablando sobre</p>
              <p className="text-xs font-medium text-white truncate">{pageContext.entityName}</p>
            </div>
            <button
              type="button"
              onClick={clearPageContext}
              className="shrink-0 rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
              aria-label="Quitar contexto de página"
              title="Quitar contexto"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-b border-white/[0.06] px-3 py-2 bg-black/10">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 border-white/20 bg-white/5 text-white" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </Button>
          <select
            className="h-8 flex-1 min-w-0 rounded-md border border-white/15 bg-white/5 px-2 text-xs text-white truncate"
            value={activeConversationId ?? ""}
            onChange={(e) => {
              setActiveConversationId(e.target.value || null);
              setIsNewConversation(false);
            }}
            disabled={!persistenceEnabled}
          >
            <option value="">Conversación nueva</option>
            {conversations.map((conv) => (
              <option key={conv.id} value={conv.id}>
                {conv.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        ref={mobile ? scrollMobileRef : scrollDesktopRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {loadingMessages ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400/80" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-2 text-center">
            <Sparkles className="h-10 w-10 text-cyan-400/90 mb-3" />
            <p className="text-sm font-medium text-white mb-1">¿En qué te ayudo?</p>
            <p className="text-xs text-white/50 mb-4">Pregunta por módulos, datos del tenant o cómo usar OPAI.</p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {quickStarters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void sendMessage(q)}
                  className="rounded-full border border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 px-3 py-2 text-xs text-cyan-100 hover:from-cyan-500/20 hover:to-emerald-500/15 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "max-w-[95%] rounded-2xl px-3 py-2.5 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-gradient-to-br from-cyan-500/35 to-emerald-600/25 text-white border border-white/10"
                  : "mr-auto bg-white/[0.04] text-white/95 border border-white/[0.06]",
              )}
            >
              <div className="whitespace-pre-wrap">{renderMessageContent(msg.content)}</div>
              {msg.role === "assistant" && (msg.visuals?.length || msg.suggestions?.length) ? (
                <VisualsRenderer
                  visuals={msg.visuals ?? []}
                  suggestions={msg.suggestions ?? []}
                  onCardAction={(a) => handleAction(a)}
                  onSuggestionAction={(a) => handleAction(a)}
                />
              ) : null}
            </div>
          ))
        )}
        {(sending && !streamingStarted) || activeToolName ? (
          <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-cyan-200/80">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:240ms]" />
            </span>
            <span>{activeToolName ? friendlyToolLabel(activeToolName) : "Pensando..."}</span>
          </div>
        ) : null}
      </div>

      <div className={cn("border-t border-white/[0.08] p-3", mobile && "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]")}>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Escribe tu pregunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
            className="bg-white/5 border-white/15 text-white placeholder:text-white/35"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="bg-gradient-to-br from-cyan-500 to-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)]"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 md:right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-cyan-400 via-emerald-500 to-indigo-600 text-white shadow-[0_10px_30px_rgba(16,185,129,0.4)] transition-transform hover:scale-[1.05] bottom-[calc(var(--bottom-nav-height,56px)+1rem)] lg:bottom-6"
        aria-label="Abrir OPAI Intelligence"
      >
        <MessageCircle className="mx-auto h-5 w-5" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div className="hidden md:flex fixed right-6 bottom-24 z-50 w-[440px] h-[72vh] max-h-[720px] flex-col rounded-2xl border border-cyan-500/20 bg-[#1a1a2e]/98 backdrop-blur-xl shadow-2xl overflow-hidden text-white">
            {panelShell(false)}
          </div>

          <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#1a1a2e] text-white pt-[env(safe-area-inset-top)]">
            {panelShell(true)}
          </div>
        </>
      ) : null}
    </>
  );
}
