"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, BarChart3, User, Map, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RondasComplianceChart } from "./RondasComplianceChart";
import { RondasReportesTable, type ReporteRow } from "./RondasReportesTable";
import { RondasReportesPorGuardia } from "./RondasReportesPorGuardia";
import { RondasReportesHeatmap } from "./RondasReportesHeatmap";
import { RondaAuditMapModal } from "./RondaAuditMapModal";

interface Installation {
  id: string;
  name: string;
}

interface GuardiaOption {
  id: string;
  label: string;
  code: string;
  rut: string;
  installationName: string;
}

interface DailyPoint {
  date: string;
  compliance: number;
  total: number;
  completed: number;
}

interface Totals {
  total: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  compliance: number;
  trustPromedio: number;
}

interface PanicAlert {
  id: string;
  createdAt: string;
  mensaje: string;
  installation: string;
  guardia: string;
  resuelta: boolean;
  isAcknowledged: boolean;
  responseTimeMin: number | null;
}

interface Props {
  initialRows: ReporteRow[];
  initialTotals: Totals;
  initialDailyCompliance: DailyPoint[];
  installations: Installation[];
  guardias: GuardiaOption[];
  companyName?: string;
  panicAlerts?: PanicAlert[];
}

const TABS = [
  { id: "instalacion", label: "Por instalación", icon: BarChart3 },
  { id: "guardia", label: "Por guardia", icon: User },
  { id: "heatmap", label: "Mapa de calor", icon: Map },
];

const STATUS_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "completada", label: "Completadas" },
  { id: "incompleta", label: "Incompletas" },
  { id: "no_realizada", label: "No realizadas" },
];

function defaultFrom(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RondasReportesClient({
  initialRows,
  initialTotals,
  initialDailyCompliance,
  installations,
  guardias,
  companyName,
  panicAlerts,
}: Props) {
  const [rows, setRows] = useState<ReporteRow[]>(initialRows);
  const [totals, setTotals] = useState<Totals>(initialTotals);
  const [dailyCompliance, setDailyCompliance] = useState<DailyPoint[]>(initialDailyCompliance);
  const [loading, setLoading] = useState(false);

  const [installationId, setInstallationId] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [guardiaFilterId, setGuardiaFilterId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [activeTab, setActiveTab] = useState("instalacion");
  const [daysRange, setDaysRange] = useState(30);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("scheduledAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [mapRow, setMapRow] = useState<ReporteRow | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (installationId) params.set("installationId", installationId);
      if (guardiaFilterId) params.set("guardiaId", guardiaFilterId);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/ops/rondas/reportes?${params}`);
      const json = await res.json();
      if (json.success) {
        setRows(json.data.rows);
        setTotals(json.data.totals);
        setDailyCompliance(json.data.dailyCompliance);
        setPage(0);
      }
    } catch {
      toast.error("Error cargando reportes");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, installationId, guardiaFilterId, statusFilter]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    void fetchData();
  }, [fetchData]);

  const instOptions = useMemo(
    () => installations.map((i) => ({ id: i.id, label: i.name })),
    [installations],
  );

  const guardiaFilterOptions = useMemo(
    () => [
      { id: "", label: "Todos los guardias" },
      ...guardias.map((g) => ({
        id: g.id,
        label: `${g.label} · ${g.code || g.rut}`,
        description: g.installationName,
        searchText: `${g.label} ${g.code} ${g.rut} ${g.installationName}`,
      })),
    ],
    [guardias],
  );

  function handleSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  async function handleExportCsv() {
    setExporting("csv");
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (installationId) params.set("installationId", installationId);
      if (guardiaFilterId) params.set("guardiaId", guardiaFilterId);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("format", "csv");

      const res = await fetch(`/api/ops/rondas/reportes?${params}`);
      if (!res.ok) throw new Error("Error exportando");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rondas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV descargado");
    } catch {
      toast.error("Error exportando CSV");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    setExporting("pdf");
    try {
      let chartImage: string | null = null;
      const chartEl = chartContainerRef.current?.querySelector(".recharts-wrapper");
      if (chartEl) {
        const svg = chartEl.querySelector("svg");
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement("canvas");
          const rect = svg.getBoundingClientRect();
          canvas.width = rect.width * 2;
          canvas.height = rect.height * 2;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const img = new window.Image();
            await new Promise<void>((resolve) => {
              img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
            });
            chartImage = canvas.toDataURL("image/png");
          }
        }
      }

      const { pdf } = await import("@react-pdf/renderer");
      const { RondasReportPDF: PdfDoc } = await import("./RondasReportPDF");
      const dateRange = `${new Date(dateFrom).toLocaleDateString("es-CL")} — ${new Date(dateTo).toLocaleDateString("es-CL")}`;

      const blob = await pdf(
        <PdfDoc totals={totals} rows={rows} dateRange={dateRange} chartImageBase64={chartImage} companyName={companyName} />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rondas-reporte-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch (err) {
      console.error("[PDF export]", err);
      toast.error("Error generando PDF");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Panic alerts banner */}
      {panicAlerts && panicAlerts.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h3 className="text-sm font-bold text-red-400">
              Alertas de Pánico ({panicAlerts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {panicAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-lg bg-red-950/30 border border-red-500/20 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="text-xs font-medium text-red-300">{alert.guardia}</p>
                    <p className="text-[10px] text-red-400/70">{alert.installation}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] shrink-0">
                  <span className="text-red-400/70">
                    {new Date(alert.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}{" "}
                    {new Date(alert.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {alert.isAcknowledged ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {alert.responseTimeMin != null ? `${alert.responseTimeMin} min` : "Atendida"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                      <Clock className="h-3 w-3" />
                      Sin atender
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global filters */}
      <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-56">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Instalación</p>
            <SearchableSelect
              value={installationId}
              options={instOptions}
              placeholder="Buscar instalación..."
              onChange={(id) => setInstallationId(id)}
            />
          </div>
          <div className="w-full sm:w-56">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Guardia</p>
            <SearchableSelect
              value={guardiaFilterId}
              options={guardiaFilterOptions}
              placeholder="Guardia"
              onChange={(id) => setGuardiaFilterId(id)}
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Desde</p>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Hasta</p>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3 w-36"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Estado</p>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-[#1a1f2e] bg-[#0a0e1a] text-[13px] text-[#f1f5f9] px-3"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-[#64748b]">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-[#06b6d4] border-t-transparent animate-spin" />
              <span className="text-[11px]">Actualizando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Trend KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total",         value: totals.total,           color: "#94a3b8" },
          { label: "Completadas",   value: totals.completadas,     color: "#22c55e" },
          { label: "Incompletas",   value: totals.incompletas,     color: "#f59e0b" },
          { label: "No realizadas", value: totals.noRealizadas,    color: "#ef4444" },
          { label: "Cumplimiento",  value: `${totals.compliance}%`, color: "#22c55e" },
          { label: "Trust Score",   value: totals.trustPromedio,   color: "#06b6d4" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border bg-[#111827] p-3 relative overflow-hidden"
            style={{ borderColor: `${kpi.color}20`, borderLeftColor: kpi.color, borderLeftWidth: 3 }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-1" style={{ color: `${kpi.color}99` }}>
              {kpi.label}
            </p>
            <p className="text-2xl font-extrabold tracking-tight" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-[#1a1f2e] overflow-hidden">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] text-[13px] font-semibold transition-colors border-r border-[#1a1f2e] last:border-r-0",
                isActive ? "bg-[#06b6d4]/10 text-[#06b6d4]" : "bg-[#111827] text-[#94a3b8] hover:text-[#f1f5f9]",
              ].join(" ")}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Por instalación */}
      {activeTab === "instalacion" && (
        <div className="space-y-4">
          <div ref={chartContainerRef}>
            <RondasComplianceChart
              data={dailyCompliance}
              daysRange={daysRange}
              onDaysChange={setDaysRange}
            />
          </div>

          <RondasReportesTable
            rows={rows}
            page={page}
            pageSize={20}
            onPageChange={setPage}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onViewMap={setMapRow}
          />

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting !== null}
              className="border-[#1a1f2e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#06b6d4]/40"
            >
              {exporting === "csv" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exporting !== null}
              className="border-[#1a1f2e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#06b6d4]/40"
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Exportar PDF
            </Button>
          </div>
        </div>
      )}

      {/* Tab: Por guardia */}
      {activeTab === "guardia" && (
        <RondasReportesPorGuardia rows={rows} guardias={guardias} />
      )}

      {/* Tab: Mapa de calor */}
      {activeTab === "heatmap" && (
        <RondasReportesHeatmap
          installations={installations}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

      {/* Audit map modal */}
      {mapRow && (
        <RondaAuditMapModal row={mapRow} onClose={() => setMapRow(null)} />
      )}
    </div>
  );
}
