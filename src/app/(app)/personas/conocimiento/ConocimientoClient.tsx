"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHero,
  Surface,
  Stat,
  StatGrid,
  EmptyState,
  Skeleton,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { InstallationCard } from "@/components/opai/conocimiento/InstallationCard";
import { InstallationTile } from "@/components/opai/conocimiento/InstallationTile";
import type {
  InstallationStatus,
  OverviewResult,
} from "@/lib/protocols/knowledge-aggregator-types";

type SortKey = "score_asc" | "score_desc" | "name" | "lastExam";
type ViewMode = "list" | "grid";

const VIEW_STORAGE_KEY = "opai.knowledge.viewMode";

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
  const [view, setView] = useState<ViewMode>("list");

  // Persist view preference per browser, default to grid on lg+ for new users.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode | null;
    if (saved === "list" || saved === "grid") {
      setView(saved);
      return;
    }
    if (window.matchMedia?.("(min-width: 1024px)").matches) setView("grid");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

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

  const protocolPct =
    kpis && kpis.totalInstallations
      ? Math.round((kpis.withProtocol / kpis.totalInstallations) * 100)
      : null;

  return (
    <section className="relative max-w-md mx-auto md:max-w-3xl lg:max-w-5xl px-4 pt-5 pb-32 ds-page-enter">
      <PageHero
        title="El protocolo"
        subtitle="a través de tu operación"
        description="Estado de protocolos y conocimiento de tus guardias en cada instalación. Toca cualquier tarjeta para entrar al detalle."
      />

      {/* KPIs */}
      <div className="mt-6">
        <StatGrid lgCols={4}>
          <Stat
            label="Instalaciones"
            value={kpis ? kpis.totalInstallations : "—"}
            animate={!!kpis}
            icon={Building2}
            hint={kpis ? `${kpis.totalEvaluations} evaluaciones` : undefined}
          />
          <Stat
            label="Con protocolo"
            value={protocolPct !== null ? `${protocolPct}%` : "—"}
            variant="ok"
            hint={kpis ? `${kpis.withProtocol}/${kpis.totalInstallations}` : undefined}
          />
          <Stat
            label="Cumplimiento"
            value={compliancePct !== null ? `${compliancePct}%` : "—"}
            variant={
              compliancePct === null
                ? "default"
                : compliancePct >= 80
                  ? "ok"
                  : compliancePct >= 60
                    ? "warn"
                    : "danger"
            }
            hint={
              kpis && kpis.totalEvaluations
                ? `${kpis.totalEvaluations} evaluaciones`
                : undefined
            }
          />
          <Stat
            label="Atención"
            value={kpis ? kpis.criticalInstallations : "—"}
            animate={!!kpis}
            variant={kpis && kpis.criticalInstallations > 0 ? "danger" : "default"}
            hint="requieren refuerzo"
          />
        </StatGrid>
      </div>

      {/* Buscador + filtros */}
      <div className="mt-5 flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
          <input
            type="text"
            placeholder="Buscar instalación o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-ds-md bg-ds-surface-1 border border-ds-border-default text-[15px] sm:text-[14px] text-ds-text-1 placeholder:text-ds-text-4 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant={showFilters ? "default" : "outline"}
          onClick={() => setShowFilters((v) => !v)}
          className="h-10 gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </Button>
      </div>

      {showFilters && (
        <div className="mt-3 flex gap-1.5 flex-wrap ds-list-cascade">
          {STATUS_FILTERS.map((f) => (
            <button
              type="button"
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "px-3 h-8 rounded-full border text-[12px] font-medium ds-tap transition-colors",
                statusFilter === f.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-ds-border-default bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 sticky top-0 z-[5] bg-background/80 backdrop-blur-sm py-1">
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
          {visibleCount} {visibleCount === 1 ? "instalación" : "instalaciones"}
        </p>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <div className="flex p-0.5 rounded-ds-md bg-ds-surface-1 border border-ds-border-default">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "h-7 px-2.5 rounded text-[12px] font-medium flex items-center gap-1 ds-tap transition-colors",
                view === "list"
                  ? "bg-ds-surface-3 text-ds-text-1"
                  : "text-ds-text-3 hover:text-ds-text-1",
              )}
              aria-label="Vista lista"
              aria-pressed={view === "list"}
            >
              <LayoutList className="h-3 w-3" />
              <span className="hidden md:inline">Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "h-7 px-2.5 rounded text-[12px] font-medium flex items-center gap-1 ds-tap transition-colors",
                view === "grid"
                  ? "bg-ds-surface-3 text-ds-text-1"
                  : "text-ds-text-3 hover:text-ds-text-1",
              )}
              aria-label="Vista grilla"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="h-3 w-3" />
              <span className="hidden md:inline">Grilla</span>
            </button>
          </div>
          {/* Sort */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSort((v) => !v)}
              className="h-8 px-2.5 rounded-ds-md border border-ds-border-default bg-ds-surface-1 text-ds-text-2 text-[12px] font-medium ds-tap flex items-center gap-1.5 hover:bg-ds-surface-2 transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              {SORT_LABELS[sort]}
            </button>
            {showSort && (
              <div className="absolute right-0 top-9 z-10 w-44 rounded-ds-md border border-ds-border-default bg-ds-surface-2 shadow-ds-lg p-1">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => {
                      setSort(k);
                      setShowSort(false);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 h-8 rounded text-[12px] transition-colors",
                      sort === k
                        ? "bg-primary/15 text-primary"
                        : "text-ds-text-2 hover:bg-ds-surface-3",
                    )}
                  >
                    {SORT_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lista / Grilla */}
      <div
        className={cn(
          "mt-3",
          view === "list"
            ? "space-y-2.5"
            : "grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
          installations.length > (view === "list" ? 6 : 12)
            ? "max-h-[70vh] md:max-h-[78vh] overflow-y-auto pr-1 ds-scroll-x rounded-ds-lg border border-ds-border-subtle bg-ds-surface-0 p-2"
            : "",
        )}
      >
        {loading && (
          <>
            {Array.from({ length: view === "grid" ? 8 : 4 }).map((_, i) => (
              <Skeleton
                key={i}
                shape="rect"
                className={cn(view === "grid" ? "h-[140px]" : "h-[110px]")}
              />
            ))}
          </>
        )}
        {!loading && error && (
          <Surface
            elevation={1}
            padding="md"
            className={cn(
              "border-status-danger-border bg-status-danger-soft text-center",
              view === "grid" && "col-span-full",
            )}
          >
            <p className="text-[13px] text-status-danger-fg">{error}</p>
          </Surface>
        )}
        {!loading && !error && installations.length === 0 && (
          <Surface
            elevation={1}
            padding="none"
            className={view === "grid" ? "col-span-full" : ""}
          >
            <EmptyState
              icon={Building2}
              title={
                totalCount === 0
                  ? "Aún no hay instalaciones"
                  : "Sin resultados con esos filtros"
              }
              description={
                totalCount === 0
                  ? "Crea tu primera instalación para empezar a evaluar el conocimiento del equipo."
                  : "Ajusta la búsqueda o quita los filtros para ver más."
              }
              action={
                totalCount === 0 ? (
                  <Button asChild>
                    <a href="/crm/installations/new">Crear primera instalación</a>
                  </Button>
                ) : undefined
              }
              secondary={
                totalCount > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          </Surface>
        )}

        {!loading &&
          !error &&
          installations.map((i) =>
            view === "grid" ? (
              <InstallationTile
                key={i.id}
                data={i}
                onClick={() => router.push(`/personas/conocimiento/${i.id}`)}
              />
            ) : (
              <InstallationCard
                key={i.id}
                data={i}
                onClick={() => router.push(`/personas/conocimiento/${i.id}`)}
              />
            ),
          )}
      </div>

      {!loading && remaining > 0 && (
        <p className="mt-5 text-center text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
          {remaining} instalaciones más coinciden con esta vista
        </p>
      )}
    </section>
  );
}
