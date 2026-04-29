"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileDown,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Blob,
  CompactKpi,
  Pill,
  StatusDot,
  thresholdFromScore,
  thresholdText,
  type Threshold,
} from "@/components/opai/conocimiento/_primitives";
import { SectionComplianceList } from "@/components/opai/conocimiento/SectionComplianceList";
import { HeatmapMatrix } from "@/components/opai/conocimiento/HeatmapMatrix";
import { GuardsList } from "@/components/opai/conocimiento/GuardsList";
import type { InstallationDetailResult } from "@/lib/protocols/knowledge-aggregator-types";

type ApiOk = { success: true; data: InstallationDetailResult };

function thresholdFromCompliance(score: number | null): Threshold {
  return thresholdFromScore(score);
}

function blobColor(t: Threshold): "brand" | "danger" | "ok" | "warn" {
  if (t === "danger") return "danger";
  if (t === "warn") return "warn";
  if (t === "ok") return "ok";
  return "brand";
}

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  return `${days}d`;
}

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
    // We hash on client only for telemetry purposes.
    void hashId(installationId).then((h) =>
      w.dataLayer!.push({
        event: "knowledge_installation_viewed",
        installation_id_hash: h,
      }),
    );
  }, [data, installationId]);

  if (loading) {
    return (
      <section className="relative grain-overlay max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32">
        <div className="space-y-3">
          <div className="card-mock h-24 animate-pulse" />
          <div className="card-mock h-32 animate-pulse" />
          <div className="card-mock h-64 animate-pulse" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="relative grain-overlay max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32">
        <button
          type="button"
          onClick={() => router.push("/personas/conocimiento")}
          className="flex items-center gap-1 text-[12px] text-white/60 hover:text-white tap-mock mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </button>
        <div className="card-mock p-6 text-center text-[12px] text-red-300/80">
          {error ?? "No se pudo cargar el detalle."}
        </div>
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
    <section className="relative grain-overlay max-w-md mx-auto md:max-w-3xl px-4 pt-5 pb-32">
      <Blob color={blobColor(t)} className="-top-10 right-0 w-72 h-72" />

      <div className="relative">
        <button
          type="button"
          onClick={() => router.push("/personas/conocimiento")}
          className="flex items-center gap-1 text-[12px] text-white/60 hover:text-white tap-mock mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Conocimiento
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className={cn(
              "w-12 h-12 rounded-xl grid place-items-center shrink-0 text-xl",
              t === "danger"
                ? "bg-red-500/10 border border-red-500/20"
                : t === "warn"
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : t === "ok"
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-white/[0.03] border border-white/10",
            )}
          >
            {data.installation.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight tracking-tight truncate">
              {data.installation.name}
            </h1>
            <p className="text-[12px] text-white/50 truncate">
              {accountLine || "—"}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {data.protocol.hasProtocol ? (
                <Pill variant="neutral">
                  <StatusDot threshold="ok" />
                  Protocolo v{data.protocol.version ?? 1}
                </Pill>
              ) : (
                <Pill variant="warn">Sin protocolo</Pill>
              )}
              <Pill variant="neutral">
                {data.kpis.evaluatedGuards}/{data.kpis.activeGuards} evaluados
              </Pill>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <CompactKpi
            label="Cumpl."
            value={compliance !== null ? `${compliance}%` : "—"}
            threshold={t}
          />
          <CompactKpi
            label="Guardias"
            value={
              <>
                {data.kpis.activeGuards}{" "}
                <span className="text-xs text-white/40">act.</span>
              </>
            }
          />
          <CompactKpi
            label="Última eval."
            value={daysAgo(data.kpis.lastExamAt)}
          />
        </div>

        {/* Acción recomendada */}
        {data.alert && data.alert.kind !== "none" && (
          <ActionCard
            kind={data.alert.kind}
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
        <div className="mb-5 card-mock-tight overflow-hidden">
          <button
            type="button"
            onClick={() => setHeatmapOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left tap-mock"
          >
            <span className="font-display text-[13px] font-semibold">
              Mapa de calor
            </span>
            {heatmapOpen ? (
              <ChevronDown className="h-4 w-4 text-white/40" />
            ) : (
              <ChevronRight className="h-4 w-4 text-white/40" />
            )}
          </button>
          {heatmapOpen && (
            <HeatmapMatrix sections={data.protocol.sections} guards={data.guards} />
          )}
        </div>

        {/* Envíos automáticos */}
        <div className="mb-5 card-mock-tight overflow-hidden">
          <button
            type="button"
            onClick={() => setDispatchOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left tap-mock"
          >
            <span className="font-display text-[13px] font-semibold flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-white/60" />
              Envíos automáticos
            </span>
            {dispatchOpen ? (
              <ChevronDown className="h-4 w-4 text-white/40" />
            ) : (
              <ChevronRight className="h-4 w-4 text-white/40" />
            )}
          </button>
          {dispatchOpen && (
            <DispatchPanel
              loading={dispatchLoading}
              error={dispatchError}
              history={dispatchHistory}
            />
          )}
        </div>

        {/* Guardias */}
        <GuardsList guards={data.guards} title="Guardias evaluados" />

        {/* Acciones rápidas */}
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            label="Editar protocolo"
            hint="Abrir en CRM →"
            icon={<Edit3 className="h-3.5 w-3.5" />}
            onClick={() =>
              router.push(
                `/crm/installations/${installationId}?tab=protocol&subtab=sections`,
              )
            }
          />
          <QuickAction
            label="Reporte cliente"
            hint="Descargar PDF"
            icon={<FileDown className="h-3.5 w-3.5" />}
            onClick={() => {
              window.open(
                `/api/installations/${installationId}/protocol/client-report/pdf`,
                "_blank",
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}

function ActionCard({
  kind,
  message,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: {
  kind: string;
  message: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}) {
  return (
    <div className="card-mock p-4 mb-5 relative overflow-hidden">
      <Blob color="brand" className="-top-10 -right-12 w-40 h-40" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-wider text-brand2 font-mono mb-1.5">
          Acción recomendada
        </div>
        <p className="text-[13px] text-white/85 leading-relaxed mb-3">
          {message}
        </p>
        <div className="flex gap-2">
          <a
            href={primaryHref}
            className="bg-brand hover:bg-brand2 text-white text-[12px] font-semibold tap-mock h-9 px-3 rounded-lg flex items-center gap-1.5"
          >
            {primaryLabel}
          </a>
          <a
            href={secondaryHref}
            target="_blank"
            rel="noreferrer"
            className="border border-white/10 hover:bg-white/[0.04] text-white text-[12px] font-medium tap-mock h-9 px-3 rounded-lg flex items-center gap-1.5"
          >
            {secondaryLabel}
          </a>
        </div>
      </div>
      <span className="sr-only">{kind}</span>
    </div>
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
  icon?: React.ReactNode;
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
      <div className="font-display text-[13px] font-semibold mt-1">{hint}</div>
    </button>
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
      <div className="px-3 py-4 text-[12px] text-white/50">Cargando historial...</div>
    );
  }
  if (error) {
    return (
      <div className="px-3 py-4 text-[12px] text-red-300/80">{error}</div>
    );
  }
  if (!history) return null;

  return (
    <div className="px-3 py-3 space-y-4 border-t border-white/5">
      {/* Próximos envíos */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2">
          Próximos envíos
        </div>
        {history.upcoming.length === 0 ? (
          <div className="text-[12px] text-white/40 py-2">
            Sin envíos recurrentes programados.
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {history.upcoming.map((u) => (
              <li
                key={`${u.examId}-${u.guardId}`}
                className="flex items-center justify-between gap-2 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-white/85">{u.guardName || "—"}</div>
                  <div className="truncate text-white/40 text-[11px]">
                    {u.examTitle}
                  </div>
                </div>
                <DaysUntilBadge days={u.daysUntil} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historial de corridas */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2">
          Historial de corridas
        </div>
        {history.runs.length === 0 ? (
          <div className="text-[12px] text-white/40 py-2">Sin corridas registradas.</div>
        ) : (
          <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {history.runs.map((r) => {
              const date = new Date(r.startedAt);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white/75">
                      {date.toLocaleString("es-CL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className="text-white/40">
                      {r.examsProcessed} ex · {r.assignmentsCreated} asign
                      {r.triggerSource !== "cron" ? ` · ${r.triggerSource}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-emerald-300/80">
                      ✓ {r.emailsSent}
                    </div>
                    {r.emailsFailed > 0 && (
                      <div className="text-red-300/80">✗ {r.emailsFailed}</div>
                    )}
                    {r.emailsSkipped > 0 && (
                      <div className="text-white/40">— {r.emailsSkipped}</div>
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
  // ≤ 0: vencido (rojo); 1–7: próximo (ámbar); >7: ok (neutro).
  const color =
    days <= 0
      ? "bg-red-500/15 text-red-300 border-red-500/20"
      : days <= 7
        ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
        : "bg-white/[0.04] text-white/60 border-white/10";
  const text =
    days < 0
      ? `vencido ${Math.abs(days)}d`
      : days === 0
        ? "hoy"
        : `en ${days}d`;
  return (
    <span
      className={cn(
        "shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border",
        color,
      )}
    >
      {text}
    </span>
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

void thresholdText;
