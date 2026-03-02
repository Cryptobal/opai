"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, BarChart3, User, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard, KpiGrid, FilterBar } from "@/components/opai";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { RondasComplianceChart } from "./RondasComplianceChart";
import { RondasReportesTable, type ReporteRow } from "./RondasReportesTable";
import { RondasReportesPorGuardia } from "./RondasReportesPorGuardia";
import { RondasReportesHeatmap } from "./RondasReportesHeatmap";

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

interface Props {
  initialRows: ReporteRow[];
  initialTotals: Totals;
  initialDailyCompliance: DailyPoint[];
  installations: Installation[];
  guardias: GuardiaOption[];
  companyName?: string;
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
    () => [{ id: "", label: "Todas las instalaciones" }, ...installations.map((i) => ({ id: i.id, label: i.name }))],
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
      {/* Filtros globales */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3 w-full">
          <div className="w-full sm:w-56">
            <SearchableSelect
              value={installationId}
              options={instOptions}
              placeholder="Instalación"
              onChange={(id) => setInstallationId(id)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-0.5 h-9 w-36"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-0.5 h-9 w-36"
            />
          </div>
          <div className="w-full sm:w-56">
            <SearchableSelect
              value={guardiaFilterId}
              options={guardiaFilterOptions}
              placeholder="Guardia"
              onChange={(id) => setGuardiaFilterId(id)}
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Estado</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-0.5 h-9 rounded border border-border bg-background px-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </FilterBar>

      {/* KPIs */}
      <KpiGrid columns={3}>
        <KpiCard title="Total rondas" value={totals.total} />
        <KpiCard title="Completadas" value={totals.completadas} variant="emerald" />
        <KpiCard title="Incompletas" value={totals.incompletas} variant="amber" />
        <KpiCard title="No realizadas" value={totals.noRealizadas} variant="red" />
        <KpiCard title="Cumplimiento %" value={`${totals.compliance}%`} variant="emerald" />
        <KpiCard title="Trust promedio" value={totals.trustPromedio} variant="blue" />
      </KpiGrid>

      {/* Tabs */}
      <ChipTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

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
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting !== null}
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
    </div>
  );
}
