"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileDown,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Surface,
  Stat,
  StatGrid,
  Tag,
  Spinner,
  Skeleton,
  thresholdFromScore,
  type Threshold,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { SectionComplianceList } from "@/components/opai/conocimiento/SectionComplianceList";
import { HeatmapMatrix } from "@/components/opai/conocimiento/HeatmapMatrix";
import { GuardsList } from "@/components/opai/conocimiento/GuardsList";
import type { InstallationDetailResult } from "@/lib/protocols/knowledge-aggregator-types";

type ApiOk = { success: true; data: InstallationDetailResult };

function thresholdFromCompliance(score: number | null): Threshold {
  return thresholdFromScore(score);
}

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  return `${days}d`;
}

const ICON_TILE_BG: Record<Threshold, string> = {
  ok:      "bg-status-ok-soft border-status-ok-border",
  warn:    "bg-status-warn-soft border-status-warn-border",
  danger:  "bg-status-danger-soft border-status-danger-border",
  neutral: "bg-ds-surface-2 border-ds-border-default",
};

const STAT_VARIANT_FROM_THRESHOLD = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  neutral: "default",
} as const;

type DispatchUpcoming = {
  examId: string;
  examTitle: string;
  guardId: string;
  guardName: string;
  nextDispatchAt: string;
  daysUntil: number;
};

type DispatchRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  examsProcessed: number;
  assignmentsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  triggerSource: string;
};

type DispatchHistory = {
  upcoming: DispatchUpcoming[];
  runs: DispatchRun[];
};

export function DetalleClient({ installationId }: { installationId: string }) {
  const router = useRouter();
  const [data, setData] = useState<InstallationDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistory | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/personas/conocimiento/installations/${installationId}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const code = res.status;
          throw new Error(code === 404 ? "Instalación no encontrada" : `HTTP ${code}`);
        }
        const json = (await res.json()) as ApiOk;
        if (!cancelled) setData(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  // Lazy-load dispatch history when the section is first opened.
  useEffect(() => {
    if (!dispatchOpen || dispatchHistory || dispatchLoading) return;
    let cancelled = false;
    setDispatchLoading(true);
    setDispatchError(null);
    fetch(
      `/api/personas/conocimiento/installations/${installationId}/dispatch-history`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: { success?: boolean; data?: DispatchHistory; error?: string }) => {
        if (cancelled) return;
        if (json?.success && json.data) {
          setDispatchHistory(json.data);
        } else {
          setDispatchError(json?.error ?? "No se pudo cargar el historial");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setDispatchError(e.message);
      })
      .finally(() => {
        if (!cancelled) setDispatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatchOpen, dispatchHistory, dispatchLoading, installationId]);

  // Telemetry — fire when detail loads.
  useEffect(() => {
    if (!data) return;
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
    };
    w.dataLayer = w.dataLayer ?? [];
    void hashId(installationId).then((h) =>
      w.dataLayer!.push({
        event: "knowledge_installation_viewed",
        installation_id_hash: h,
      }),
    );
  }, [data, installationId]);

  if (loading) {
    return (
      <section className="relative max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32">
        <div className="space-y-3">
          <Skeleton shape="rect" className="h-24" />
          <Skeleton shape="rect" className="h-32" />
          <Skeleton shape="rect" className="h-64" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="relative max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/personas/conocimiento")}
          className="mb-4 gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Button>
        <Surface
          elevation={1}
          padding="md"
          className="border-status-danger-border bg-status-danger-soft text-center"
        >
          <p className="text-[13px] text-status-danger-fg">
            {error ?? "No se pudo cargar el detalle."}
          </p>
        </Surface>
      </section>
    );
  }

  const t = thresholdFromCompliance(data.kpis.avgCompliance);
  const compliance =
    data.kpis.avgCompliance !== null ? Math.round(data.kpis.avgCompliance) : null;
  const accountLine = [data.installation.accountName, data.installation.commune]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="relative max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32 ds-page-enter">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/personas/conocimiento")}
        className="mb-4 gap-1.5 -ml-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Conocimiento
      </Button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div
          className={cn(
            "h-12 w-12 rounded-ds-lg grid place-items-center shrink-0 text-xl border",
            ICON_TILE_BG[t],
          )}
        >
          {data.installation.icon || <Building2 className="h-5 w-5 text-ds-text-3" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold leading-tight tracking-tight text-ds-text-1 truncate">
            {data.installation.name}
          </h1>
          <p className="text-[13px] text-ds-text-3 truncate">
            {accountLine || "—"}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {data.protocol.hasProtocol ? (
              <Tag variant="neutral" size="sm" dot>
                Protocolo v{data.protocol.version ?? 1}
              </Tag>
            ) : (
              <Tag variant="warn" size="sm">Sin protocolo</Tag>
            )}
            <Tag variant="neutral" size="sm">
              {data.kpis.evaluatedGuards}/{data.kpis.activeGuards} evaluados
            </Tag>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5">
        <StatGrid cols={2} lgCols={3}>
          <Stat
            label="Cumpl."
            value={compliance !== null ? `${compliance}%` : "—"}
            variant={STAT_VARIANT_FROM_THRESHOLD[t]}
          />
          <Stat
            label="Guardias"
            value={data.kpis.activeGuards}
            hint="activos"
          />
          <Stat
            label="Última eval."
            value={daysAgo(data.kpis.lastExamAt)}
          />
        </StatGrid>
      </div>

      {/* Acción recomendada */}
      {data.alert && data.alert.kind !== "none" && (
        <ActionCard
          message={data.alert.message ?? ""}
          primaryLabel={
            data.alert.kind === "no_protocol"
              ? "Crear protocolo"
              : "Reagendar evaluación"
          }
          primaryHref={
            data.alert.kind === "no_protocol"
              ? `/crm/installations/${installationId}?tab=protocol&subtab=sections`
              : `/crm/installations/${installationId}?tab=protocol&subtab=exams`
          }
          secondaryLabel="Descargar reporte"
          secondaryHref={`/api/installations/${installationId}/protocol/client-report/pdf`}
        />
      )}

      {/* Cumplimiento por sección */}
      <SectionComplianceList
        sections={data.sectionCompliance}
        title="Cumplimiento por sección"
      />

      {/* Heatmap colapsable */}
      <Surface elevation={1} padding="none" className="mb-5 overflow-hidden">
        <button
          type="button"
          onClick={() => setHeatmapOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3.5 py-3 text-left ds-tap"
        >
          <span className="font-display text-[14px] font-semibold text-ds-text-1">
            Mapa de calor
          </span>
          {heatmapOpen ? (
            <ChevronDown className="h-4 w-4 text-ds-text-3" />
          ) : (
            <ChevronRight className="h-4 w-4 text-ds-text-3" />
          )}
        </button>
        {heatmapOpen && (
          <HeatmapMatrix sections={data.protocol.sections} guards={data.guards} />
        )}
      </Surface>

      {/* Envíos automáticos */}
      <Surface elevation={1} padding="none" className="mb-5 overflow-hidden">
        <button
          type="button"
          onClick={() => setDispatchOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3.5 py-3 text-left ds-tap"
        >
          <span className="font-display text-[14px] font-semibold text-ds-text-1 flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-ds-text-3" />
            Envíos automáticos
          </span>
          {dispatchOpen ? (
            <ChevronDown className="h-4 w-4 text-ds-text-3" />
          ) : (
            <ChevronRight className="h-4 w-4 text-ds-text-3" />
          )}
        </button>
        {dispatchOpen && (
          <DispatchPanel
            loading={dispatchLoading}
            error={dispatchError}
            history={dispatchHistory}
          />
        )}
      </Surface>

      {/* Guardias */}
      <GuardsList guards={data.guards} title="Guardias evaluados" />

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 gap-2">
        <QuickAction
          label="Editar protocolo"
          hint="Abrir en CRM →"
          icon={Edit3}
          onClick={() =>
            router.push(
              `/crm/installations/${installationId}?tab=protocol&subtab=sections`,
            )
          }
        />
        <QuickAction
          label="Reporte cliente"
          hint="Descargar PDF"
          icon={FileDown}
          onClick={() => {
            window.open(
              `/api/installations/${installationId}/protocol/client-report/pdf`,
              "_blank",
            );
          }}
        />
      </div>
    </section>
  );
}

function ActionCard({
  message,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  message: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}) {
  return (
    <Surface elevation={2} padding="md" className="mb-5" accent="brand">
      <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-primary mb-1.5">
        Acción recomendada
      </p>
      <p className="text-[14px] text-ds-text-1 leading-relaxed mb-3">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-10">
          <a href={primaryHref}>{primaryLabel}</a>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-10">
          <a href={secondaryHref} target="_blank" rel="noreferrer">
            {secondaryLabel}
          </a>
        </Button>
      </div>
    </Surface>
  );
}

function QuickAction({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
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
      <p className="font-display text-[14px] font-semibold mt-1 text-ds-text-1">
        {hint}
      </p>
    </Surface>
  );
}

function DispatchPanel({
  loading,
  error,
  history,
}: {
  loading: boolean;
  error: string | null;
  history: DispatchHistory | null;
}) {
  if (loading) {
    return (
      <div className="px-3.5 py-4">
        <Spinner size="sm" label="Cargando historial…" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="px-3.5 py-4 text-[13px] text-status-danger-fg">{error}</p>
    );
  }
  if (!history) return null;

  return (
    <div className="px-3.5 py-3 space-y-4 border-t border-ds-border-subtle">
      {/* Próximos envíos */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-2">
          Próximos envíos
        </p>
        {history.upcoming.length === 0 ? (
          <p className="text-[13px] text-ds-text-3 py-2">
            Sin envíos recurrentes programados.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {history.upcoming.map((u) => (
              <li
                key={`${u.examId}-${u.guardId}`}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ds-text-1">{u.guardName || "—"}</p>
                  <p className="truncate text-ds-text-3 text-[12px]">
                    {u.examTitle}
                  </p>
                </div>
                <DaysUntilBadge days={u.daysUntil} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historial de corridas */}
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-2">
          Historial de corridas
        </p>
        {history.runs.length === 0 ? (
          <p className="text-[13px] text-ds-text-3 py-2">Sin corridas registradas.</p>
        ) : (
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {history.runs.map((r) => {
              const date = new Date(r.startedAt);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ds-text-2">
                      {date.toLocaleString("es-CL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-ds-text-4">
                      {r.examsProcessed} ex · {r.assignmentsCreated} asign
                      {r.triggerSource !== "cron" ? ` · ${r.triggerSource}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5 ds-num">
                    <p className="text-status-ok-fg">✓ {r.emailsSent}</p>
                    {r.emailsFailed > 0 && (
                      <p className="text-status-danger-fg">✗ {r.emailsFailed}</p>
                    )}
                    {r.emailsSkipped > 0 && (
                      <p className="text-ds-text-4">— {r.emailsSkipped}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DaysUntilBadge({ days }: { days: number }) {
  const variant: "danger" | "warn" | "neutral" =
    days <= 0 ? "danger" : days <= 7 ? "warn" : "neutral";
  const text =
    days < 0
      ? `vencido ${Math.abs(days)}d`
      : days === 0
        ? "hoy"
        : `en ${days}d`;
  return (
    <Tag variant={variant} size="sm">
      {text}
    </Tag>
  );
}

async function hashId(id: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return "no-hash";
  const buf = new TextEncoder().encode(id);
  const out = await window.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(out))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
