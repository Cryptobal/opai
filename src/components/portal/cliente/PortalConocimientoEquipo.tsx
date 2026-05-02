"use client";

import { useEffect, useMemo } from "react";
import { Check, Download, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalData } from "@/hooks/usePortalData";
import {
  Surface,
  Stat,
  StatGrid,
  StatusDot,
  IconBubble,
  Skeleton,
  EmptyState,
  thresholdFromScore,
  type Threshold,
} from "@/components/opai-ds";
import { SectionComplianceList } from "@/components/opai/conocimiento/SectionComplianceList";
import { ClienteSession } from "@/lib/portal-cliente-types";
import type {
  InstallationDetailMonthlyAvg,
  InstallationDetailResult,
} from "@/lib/protocols/knowledge-aggregator-types";

interface Props {
  session: ClienteSession;
  installationId: string;
}

interface ClientPayload extends Omit<InstallationDetailResult, "trend"> {
  trend: InstallationDetailMonthlyAvg[];
}

const VALUE_COLOR: Record<Threshold, string> = {
  ok:      "text-status-ok-fg",
  warn:    "text-status-warn-fg",
  danger:  "text-status-danger-fg",
  neutral: "text-ds-text-3",
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function headlineFromCompliance(c: number | null): string {
  if (c === null) return "Estamos preparando la evaluación inicial";
  if (c >= 80) return "Tu equipo conoce el protocolo";
  if (c >= 60) return "Tu equipo está reforzando el protocolo";
  return "Estamos capacitando a tu equipo";
}

export function PortalConocimientoEquipo({ session, installationId }: Props) {
  const { data, loading } = usePortalData<ClientPayload>({
    endpoint: "/api/portal/cliente/conocimiento",
    demoKey: "knowledge_team",
    params: installationId ? { installationId } : undefined,
    skip: !installationId,
  });

  const compliance = data?.kpis.avgCompliance ?? null;
  const t: Threshold = thresholdFromScore(compliance);
  const lastExamDays = daysAgo(data?.kpis.lastExamAt ?? null);
  const evaluatedGuards = data?.kpis.evaluatedGuards ?? 0;
  const activeGuards = data?.kpis.activeGuards ?? 0;
  const approvedCount = data?.kpis.approvedCount ?? 0;
  const pendingCount = data?.kpis.pendingCount ?? 0;
  const headline = useMemo(() => headlineFromCompliance(compliance), [compliance]);
  const trend = data?.trend ?? [];
  const monthFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" });
    } catch {
      return null;
    }
  }, []);
  const currentMonth = useMemo(() => {
    const now = new Date();
    return monthFmt
      ? monthFmt.format(now).replace(/^./, (c) => c.toUpperCase())
      : `${now.getMonth() + 1}/${now.getFullYear()}`;
  }, [monthFmt]);

  // Telemetry — fire when this view loads.
  useEffect(() => {
    if (!data) return;
    if (typeof window === "undefined") return;
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event: "client_knowledge_viewed" });
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-2.5 mt-3">
        <Skeleton shape="rect" className="h-40" />
        <Skeleton shape="rect" className="h-16" />
        <Skeleton shape="rect" className="h-32" />
      </div>
    );
  }

  if (!data || (!data.protocol.hasProtocol && evaluatedGuards === 0 && activeGuards === 0)) {
    return (
      <Surface elevation={1} padding="none" className="mt-3">
        <EmptyState
          icon={Check}
          tone="brand"
          title="Aún no hay evaluaciones del equipo"
          description="Tu proveedor está preparando la evaluación inicial del equipo. Te avisaremos en cuanto esté lista."
        />
      </Surface>
    );
  }

  return (
    <section className="relative ds-page-enter">
      {/* Hero card */}
      <Surface
        elevation={2}
        padding="lg"
        accent={t === "neutral" ? "brand" : t}
        className="mt-1"
      >
        <div className="relative">
          <div
            aria-hidden
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-status-ok/20 blur-3xl pointer-events-none"
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot kind={t === "neutral" ? "ok" : t} pulse glow />
              <span
                className={cn(
                  "text-[11px] font-mono uppercase tracking-[0.08em]",
                  t === "danger"
                    ? "text-status-danger-fg"
                    : t === "warn"
                      ? "text-status-warn-fg"
                      : "text-status-ok-fg",
                )}
              >
                vigente
              </span>
            </div>
            <p className="font-display text-[16px] font-semibold leading-snug mb-1 text-ds-text-1">
              {headline}
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display text-5xl font-bold leading-none ds-num",
                  compliance !== null ? VALUE_COLOR[t] : "text-ds-text-4",
                )}
              >
                {compliance !== null ? Math.round(compliance) : "—"}
                <span className="text-2xl">{compliance !== null ? "%" : ""}</span>
              </span>
              <span className="text-[12px] font-mono text-ds-text-4">
                cumplimiento
              </span>
            </div>
            <p className="text-[13px] text-ds-text-3 mt-3 leading-relaxed">
              {evaluatedGuards} de {activeGuards} guardias evaluados en los últimos 30
              días.
              {lastExamDays !== null
                ? ` Última evaluación: hace ${lastExamDays} días.`
                : null}
            </p>
          </div>
        </div>
      </Surface>

      {/* KPIs */}
      <div className="mt-3">
        <StatGrid cols={2} lgCols={3}>
          <Stat
            label="Aprobados"
            value={`${approvedCount}/${Math.max(evaluatedGuards, approvedCount)}`}
            variant="ok"
          />
          <Stat
            label="Pendientes"
            value={pendingCount}
            variant={pendingCount > 0 ? "warn" : "default"}
            animate
          />
          <Stat
            label="Última"
            value={lastExamDays !== null ? `${lastExamDays}d` : "—"}
          />
        </StatGrid>
      </div>

      <SectionComplianceList
        sections={data.sectionCompliance}
        title="Conocimiento por área"
        className="mt-5"
      />

      {/* Trust badge */}
      <Surface elevation={1} padding="md" className="mt-3">
        <div className="flex items-start gap-3">
          <IconBubble icon={Check} variant="ok" size="md" rounded="circle" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-[13px] font-semibold text-status-ok-fg">
              Tu proveedor capacita activamente
            </p>
            <p className="text-[12px] text-ds-text-3 leading-relaxed mt-1">
              Las evaluaciones se actualizan cada 6 meses y al ingreso de cada
              guardia nuevo. Te notificaremos cualquier baja de cumplimiento.
            </p>
          </div>
        </div>
      </Surface>

      {/* Trend chart */}
      {trend.length >= 2 && <TrendChart data={trend} />}

      {/* Acciones cliente */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <ClientAction
          icon={Download}
          label="Descargar reporte"
          hint={`PDF · ${currentMonth}`}
          onClick={() => {
            if (typeof window !== "undefined") {
              const w = window as unknown as {
                dataLayer?: Array<Record<string, unknown>>;
              };
              w.dataLayer = w.dataLayer ?? [];
              w.dataLayer.push({ event: "client_knowledge_pdf_downloaded" });
              window.open(
                `/api/installations/${installationId}/protocol/client-report/pdf`,
                "_blank",
              );
            }
          }}
        />
        <ClientAction
          icon={Phone}
          label="Hablar con tu KAM"
          hint={session.ejecutivoName ?? "Atención cliente"}
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/portal/cliente/chat";
          }}
        />
      </div>
    </section>
  );
}

function ClientAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  const Icon = icon;
  return (
    <Surface
      elevation={1}
      padding="sm"
      tappable
      hoverable
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="text-left"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <p className="font-display text-[14px] font-semibold mt-1 truncate text-ds-text-1">
        {hint}
      </p>
    </Surface>
  );
}

/**
 * Mini gráfico de tendencia 6 meses. Sin librería externa: SVG inline
 * con stroke/fill via clases Tailwind del DS para que respeten light + dark.
 */
function TrendChart({ data }: { data: InstallationDetailMonthlyAvg[] }) {
  const width = 280;
  const height = 80;
  const padX = 12;
  const padY = 12;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  const maxY = Math.max(100, ...data.map((d) => d.avgScore));
  const minY = 0;

  const points = data.map((d, i) => {
    const x = padX + (i * usableW) / Math.max(data.length - 1, 1);
    const y = padY + usableH - ((d.avgScore - minY) / (maxY - minY)) * usableH;
    return { x, y, label: d.month, value: d.avgScore };
  });

  const last = points[points.length - 1].value;
  const first = points[0].value;
  const trendUp = last - first;

  // Threshold semántico para el color del trend
  const trendKind: "ok" | "warn" | "danger" =
    trendUp > 1 ? "ok" : trendUp < -1 ? "danger" : "warn";

  // currentColor del SVG sigue al "text-status-*-fg" del contenedor;
  // así stroke/fill respetan light + dark sin variables extra.
  const colorClass =
    trendKind === "ok"
      ? "text-status-ok-fg"
      : trendKind === "danger"
        ? "text-status-danger-fg"
        : "text-status-warn-fg";

  const fillId = `trend-fill-${trendKind}`;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(2)} ${
    height - padY
  } L ${points[0].x.toFixed(2)} ${height - padY} Z`;

  return (
    <Surface elevation={1} padding="sm" className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display text-[13px] font-semibold text-ds-text-1">
          Tendencia 6 meses
        </span>
        <span className={cn("text-[12px] font-mono ds-num", colorClass)}>
          {trendUp > 0 ? "↑" : trendUp < 0 ? "↓" : "·"} {Math.round(Math.abs(trendUp))}pp
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={cn("w-full h-20", colorClass)}
        aria-hidden
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={path} fill="none" strokeWidth={1.5} stroke="currentColor" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill="currentColor" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] font-mono uppercase tracking-[0.06em] text-ds-text-4 mt-1">
        {points.map((p, i) => (
          <span key={i}>{p.label.slice(5)}</span>
        ))}
      </div>
    </Surface>
  );
}
