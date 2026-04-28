"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Blob,
  KpiCard,
  Pill,
  StatusDot,
} from "@/components/opai/conocimiento/_primitives";
import { InstallationCard } from "@/components/opai/conocimiento/InstallationCard";
import type {
  InstallationStatus,
  OverviewResult,
} from "@/lib/protocols/knowledge-aggregator-types";

type SortKey = "score_asc" | "score_desc" | "name" | "lastExam";

interface ApiOk {
  success: true;
  data: OverviewResult;
}

const STATUS_FILTERS: Array<{ key: InstallationStatus | "all"; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "critical", label: "Críticas" },
  { key: "warning", label: "En refuerzo" },
  { key: "no_evaluated", label: "Sin evaluar" },
  { key: "no_protocol", label: "Sin protocolo" },
  { key: "ok", label: "Al día" },
];

const SORT_LABELS: Record<SortKey, string> = {
  score_asc: "Cumpl. ↑",
  score_desc: "Cumpl. ↓",
  name: "Nombre",
  lastExam: "Última eval.",
};

export function ConocimientoClient() {
  const router = useRouter();
  const [data, setData] = useState<OverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InstallationStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("score_asc");
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (sort) params.set("order", sort);
        const res = await fetch(
          `/api/personas/conocimiento/overview?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  }, [search, statusFilter, sort]);

  // Telemetry — fire once when first data arrives.
  useEffect(() => {
    if (!data) return;
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      dataLayer?: Array<Record<string, unknown>>;
    };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event: "knowledge_overview_viewed" });
  }, [data]);

  const installations = data?.installations ?? [];
  const kpis = data?.kpis;
  const visibleCount = installations.length;
  const totalCount = data?.kpis.totalInstallations ?? 0;
  const remaining = Math.max(0, totalCount - visibleCount);

  const compliancePct = useMemo(() => {
    if (!kpis) return null;
    return kpis.avgCompliance !== null ? Math.round(kpis.avgCompliance) : null;
  }, [kpis]);

  return (
    <section className="relative grain-overlay max-w-md mx-auto md:max-w-3xl lg:max-w-5xl px-4 pt-5 pb-32">
      <Blob color="brand" className="-top-10 -left-20 w-72 h-72" />

      <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-mono mb-3 relative">
        <span>Personas</span>
        <span className="text-white/20">/</span>
        <span className="text-white/80">Conocimiento</span>
      </div>

      <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight tracking-tight relative">
        El protocolo
        <br />
        <span className="text-white/40">a través de tu operación</span>
      </h1>
      <p className="text-[13px] text-white/50 mt-2 leading-relaxed relative">
        Estado de protocolos y conocimiento de tus guardias en cada instalación.
        Toca cualquier tarjeta para entrar al detalle.
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5 relative">
        <KpiCard
          label="Instalaciones"
          value={kpis ? String(kpis.totalInstallations) : "—"}
          rightSlot={<Building2 className="h-3.5 w-3.5 text-white/30" />}
          hint={kpis ? `${kpis.totalEvaluations} evaluaciones` : undefined}
        />
        <KpiCard
          label="Con protocolo"
          value={
            kpis
              ? `${
                  kpis.totalInstallations
                    ? Math.round((kpis.withProtocol / kpis.totalInstallations) * 100)
                    : 0
                }%`
              : "—"
          }
          threshold="ok"
          bar={
            kpis && kpis.totalInstallations
              ? Math.round((kpis.withProtocol / kpis.totalInstallations) * 100)
              : 0
          }
          rightSlot={
            kpis ? (
              <span className="text-[10px] text-white/30 font-mono">
                {kpis.withProtocol}/{kpis.totalInstallations}
              </span>
            ) : undefined
          }
        />
        <KpiCard
          label="Cumplimiento"
          value={compliancePct !== null ? `${compliancePct}%` : "—"}
          threshold={
            compliancePct === null
              ? "neutral"
              : compliancePct >= 80
                ? "ok"
                : compliancePct >= 60
                  ? "warn"
                  : "danger"
          }
          hint={kpis && kpis.totalEvaluations ? `${kpis.totalEvaluations} evaluaciones` : undefined}
          rightSlot={
            compliancePct !== null && compliancePct < 80 ? (
              <Pill variant={compliancePct < 60 ? "danger" : "warn"}>prom.</Pill>
            ) : undefined
          }
        />
        <KpiCard
          label="Atención"
          value={kpis ? String(kpis.criticalInstallations) : "—"}
          threshold={
            kpis && kpis.criticalInstallations > 0 ? "danger" : "neutral"
          }
          hint="requieren refuerzo"
          rightSlot={
            kpis && kpis.criticalInstallations > 0 ? (
              <StatusDot threshold="danger" pulse />
            ) : undefined
          }
        />
      </div>

      {/* Buscador + filtros */}
      <div className="mt-5 flex items-center gap-2 relative">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            type="text"
            placeholder="Buscar instalación o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-brand/40"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "h-10 px-3 rounded-lg border tap-mock flex items-center gap-1.5 text-[12px] font-medium",
            showFilters
              ? "border-brand/40 bg-brand/10 text-brand2"
              : "border-white/10 bg-white/[0.03] text-white/70",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </button>
      </div>

      {showFilters && (
        <div className="mt-3 flex gap-1.5 flex-wrap relative">
          {STATUS_FILTERS.map((f) => (
            <button
              type="button"
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "px-2.5 h-7 rounded-full border text-[11px] font-medium tap-mock",
                statusFilter === f.key
                  ? "border-brand/40 bg-brand/10 text-brand2"
                  : "border-white/10 bg-white/[0.03] text-white/60",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between relative sticky top-0 z-[5] bg-background/80 backdrop-blur-sm py-1">
        <div className="text-[10px] text-white/30 font-mono">
          {visibleCount} {visibleCount === 1 ? "instalación" : "instalaciones"}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSort((v) => !v)}
            className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-white/70 text-[11px] font-medium tap-mock flex items-center gap-1.5"
          >
            <ArrowUpDown className="h-3 w-3" />
            {SORT_LABELS[sort]}
          </button>
          {showSort && (
            <div className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-white/10 bg-[#0F1620] shadow-glow-brand p-1">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => {
                    setSort(k);
                    setShowSort(false);
                  }}
                  className={cn(
                    "w-full text-left px-2.5 h-7 rounded-md text-[11px]",
                    sort === k
                      ? "bg-brand/15 text-brand2"
                      : "text-white/70 hover:bg-white/[0.04]",
                  )}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista — encuadrada con scroll para no convertirse en una tira infinita */}
      <div
        className={cn(
          "mt-3 space-y-2.5 relative",
          // Frame scrollable: alto visible 70vh, scroll suave dentro de la card.
          // En desktop crece un poco más para aprovechar el viewport.
          installations.length > 6
            ? "max-h-[70vh] md:max-h-[78vh] overflow-y-auto pr-1 scrollbar-none rounded-2xl border border-white/[0.04] bg-white/[0.01] p-2"
            : "",
        )}
      >
        {loading && (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="card-mock p-4 h-[110px] animate-pulse opacity-70"
              />
            ))}
          </>
        )}
        {!loading && error && (
          <div className="card-mock p-4 text-center text-[12px] text-red-300/80">
            {error}
          </div>
        )}
        {!loading && !error && installations.length === 0 && (
          <div className="card-mock p-8 text-center">
            <Building2 className="h-8 w-8 mx-auto text-white/20 mb-3" />
            <div className="font-display text-[14px] font-semibold mb-1">
              {totalCount === 0
                ? "Aún no hay instalaciones"
                : "Sin resultados con esos filtros"}
            </div>
            <p className="text-[12px] text-white/50 mb-4">
              {totalCount === 0
                ? "Crea tu primera instalación para empezar a evaluar el conocimiento del equipo."
                : "Ajusta la búsqueda o quita los filtros para ver más."}
            </p>
            {totalCount === 0 && (
              <a
                href="/crm/installations/new"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-brand2 text-white text-[12px] font-semibold"
              >
                Crear primera instalación
              </a>
            )}
          </div>
        )}

        {!loading &&
          !error &&
          installations.map((i) => (
            <InstallationCard
              key={i.id}
              data={i}
              onClick={() => router.push(`/personas/conocimiento/${i.id}`)}
            />
          ))}
      </div>

      {!loading && remaining > 0 && (
        <div className="mt-5 text-center">
          <div className="text-[10px] text-white/30 font-mono">
            {remaining} instalaciones más coinciden con esta vista
          </div>
        </div>
      )}
    </section>
  );
}
