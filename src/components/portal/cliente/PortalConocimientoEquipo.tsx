"use client";

import { useEffect, useMemo } from "react";
import { Check, Download, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalData } from "@/hooks/usePortalData";
import {
  Blob,
  CompactKpi,
  StatusDot,
  thresholdFromScore,
  thresholdText,
  type Threshold,
} from "@/components/opai/conocimiento/_primitives";
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
        <div className="card-mock h-40 animate-pulse" />
        <div className="card-mock h-16 animate-pulse" />
        <div className="card-mock-tight h-32 animate-pulse" />
      </div>
    );
  }

  if (!data || (!data.protocol.hasProtocol && evaluatedGuards === 0 && activeGuards === 0)) {
    return (
      <div className="card-mock p-5 text-center mt-3">
        <p className="font-display text-[14px] font-semibold mb-1">
          Aún no hay evaluaciones del equipo
        </p>
        <p className="text-[12px] text-white/55 leading-relaxed">
          Tu proveedor está preparando la evaluación inicial del equipo. Te
          avisaremos en cuanto esté lista.
        </p>
      </div>
    );
  }

  return (
    <section className="relative">
      <Blob color={t === "danger" ? "danger" : t === "warn" ? "warn" : "ok"} className="-top-10 -left-10 w-72 h-72" />

      {/* Hero card */}
      <div className="card-mock mt-1 p-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <StatusDot threshold={t === "neutral" ? "ok" : t} pulse />
            <span
              className={cn(
                "text-[10px] uppercase tracking-wider font-mono",
                t === "danger"
                  ? "text-red-300"
                  : t === "warn"
                    ? "text-amber-300"
                    : "text-emerald-300",
              )}
            >
              vigente
            </span>
          </div>
          <div className="font-display text-[15px] font-semibold leading-snug mb-1">
            {headline}
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-5xl font-bold num-tabular leading-none",
                compliance !== null ? thresholdText(t) : "text-white/40",
              )}
            >
              {compliance !== null ? Math.round(compliance) : "—"}
              <span className="text-2xl">{compliance !== null ? "%" : ""}</span>
            </span>
            <span className="text-[11px] text-white/40 font-mono">
              cumplimiento
            </span>
          </div>
          <p className="text-[12px] text-white/60 mt-3 leading-relaxed">
            {evaluatedGuards} de {activeGuards} guardias evaluados en los últimos 30
            días.
            {lastExamDays !== null
              ? ` Última evaluación: hace ${lastExamDays} días.`
              : null}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <CompactKpi
          label="Aprobados"
          value={`${approvedCount}/${Math.max(evaluatedGuards, approvedCount)}`}
          threshold="ok"
        />
        <CompactKpi
          label="Pendientes"
          value={pendingCount}
          threshold={pendingCount > 0 ? "warn" : "neutral"}
        />
        <CompactKpi
          label="Última"
          value={lastExamDays !== null ? `${lastExamDays}d` : "—"}
        />
      </div>

      <SectionComplianceList
        sections={data.sectionCompliance}
        title="Conocimiento por área"
        className="mt-5"
      />

      {/* Trust badge */}
      <div className="mt-3 card-mock-tight p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 grid place-items-center shrink-0">
          <Check className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[12px] font-semibold text-emerald-300">
            Tu proveedor capacita activamente
          </div>
          <p className="text-[11px] text-white/55 leading-relaxed mt-1">
            Las evaluaciones se actualizan cada 6 meses y al ingreso de cada
            guardia nuevo. Te notificaremos cualquier baja de cumplimiento.
          </p>
        </div>
      </div>

      {/* Trend chart */}
      {trend.length >= 2 && <TrendChart data={trend} />}

      {/* Acciones cliente */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <ClientAction
          icon={<Download className="h-3.5 w-3.5" />}
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
          icon={<Phone className="h-3.5 w-3.5" />}
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
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-mock-tight p-3 text-left tap-mock"
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 font-mono">
        {icon}
        {label}
      </div>
      <div className="font-display text-[13px] font-semibold mt-1 truncate">
        {hint}
      </div>
    </button>
  );
}

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
  const stroke = trendUp > 1 ? "#10B981" : trendUp < -1 ? "#EF4444" : "#F59E0B";
  const fillId = `trend-fill-${stroke.replace("#", "")}`;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const area = `${path} L ${points[points.length - 1].x.toFixed(2)} ${
    height - padY
  } L ${points[0].x.toFixed(2)} ${height - padY} Z`;

  return (
    <div className="card-mock p-3 mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-display text-[12px] font-semibold">
          Tendencia 6 meses
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: stroke }}
        >
          {trendUp > 0 ? "↑" : trendUp < 0 ? "↓" : "·"} {Math.round(Math.abs(trendUp))}pp
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={stroke} />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-white/30 font-mono mt-1">
        {points.map((p, i) => (
          <span key={i}>{p.label.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}
