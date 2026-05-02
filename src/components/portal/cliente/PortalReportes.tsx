"use client";

import { useMemo, useState, useEffect } from "react";
import { FileText, Download, Loader2, BarChart3 } from "lucide-react";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { cn } from "@/lib/utils";
import { PreviewBadge } from "./PreviewBadge";

/* ── Types ── */

type Reporte = {
  id: string;
  installationId: string | null;
  period: string;
  pdfUrl: string | null;
  generatedAt: string | null;
  sentAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

/* ── Helpers ── */

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatPeriod(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTHS[parseInt(month) - 1]} ${year}`;
}

/* ── Props ── */

interface Props {
  session: ClienteSession;
  isProspect?: boolean;
}

/* ══════════════════════════════════════════════════════ */

export function PortalReportes({ session, isProspect }: Props) {
  const installationMap = useMemo(
    () =>
      Object.fromEntries(
        (session?.installations ?? []).map((i) => [i.id, i.name]),
      ) as Record<string, string>,
    [session?.installations],
  );

  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetchReportes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accountId]);

  async function fetchReportes() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/cliente/reportes");
      const json = await res.json();
      if (json.success) {
        setReportes(json.data);
      } else {
        setError(json.error || "Error al cargar reportes");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(reporte: Reporte) {
    if (!reporte.pdfUrl) return;
    setDownloading(reporte.id);
    try {
      // Open download URL in new tab — follows redirect from the API
      window.open(
        `/api/portal/cliente/reportes/${reporte.id}/download`,
        "_blank",
        "noopener,noreferrer"
      );
    } finally {
      setDownloading(null);
    }
  }

  /* ── Prospect placeholder (after hooks to respect Rules of Hooks) ── */
  if (isProspect) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24 space-y-3">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Reportes</h2>
            <PreviewBadge />
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Informes detallados de tu servicio de seguridad
          </p>
        </div>
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5 space-y-3">
          <p className="text-sm text-zinc-300 font-medium">Reportes mensuales automáticos</p>
          <ul className="space-y-2 text-xs text-zinc-400">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-status-info" />Métricas de cumplimiento y operación</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-status-info" />Evaluación de guardias y desempeño</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-status-info" />Recomendaciones de mejora</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-status-info" />Descarga en PDF</li>
          </ul>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando reportes...</span>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-status-danger-fg">
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchReportes}
          className="text-xs underline text-zinc-400 hover:text-zinc-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  /* ── Empty state ── */
  if (reportes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-zinc-500 px-6">
        <BarChart3 className="h-10 w-10 text-zinc-700" />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-400">
            Sin reportes disponibles aún
          </p>
          <p className="text-xs mt-1">
            Los reportes se generan automáticamente cada período.
          </p>
        </div>
      </div>
    );
  }

  /* ── List ── */
  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24 space-y-3">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Reportes</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Informes detallados de tu servicio de seguridad
        </p>
      </div>

      {reportes.map((reporte) => {
        const data = reporte.data as Record<string, unknown> | null;
        const compliance =
          data && typeof data.compliance === "number" ? data.compliance : null;
        const hasPdf = !!reporte.pdfUrl;

        return (
          <div
            key={reporte.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center gap-4"
          >
            {/* Icon */}
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-status-info-soft flex items-center justify-center">
              <FileText className="h-5 w-5 text-status-info-fg" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {formatPeriod(reporte.period)}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {reporte.installationId && (
                  <span className="text-xs text-zinc-500 truncate">
                    Instalación: {installationMap[reporte.installationId] ?? reporte.installationId.slice(0, 8) + "..."}
                  </span>
                )}
                {compliance !== null && (
                  <span
                    className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded",
                      compliance >= 80
                        ? "bg-status-ok-soft text-status-ok-fg"
                        : compliance >= 60
                        ? "bg-status-warn-soft text-status-warn-fg"
                        : "bg-status-danger-soft text-status-danger-fg"
                    )}
                  >
                    {compliance}% cumplimiento
                  </span>
                )}
              </div>
              {reporte.generatedAt && (
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  Generado{" "}
                  {new Date(reporte.generatedAt).toLocaleDateString("es-CL")}
                </p>
              )}
            </div>

            {/* Download button */}
            <button
              onClick={() => handleDownload(reporte)}
              disabled={!hasPdf || downloading === reporte.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0",
                hasPdf
                  ? "bg-status-info hover:bg-status-info text-white"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              )}
              title={hasPdf ? "Descargar PDF" : "PDF no disponible aun"}
            >
              {downloading === reporte.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {hasPdf ? "PDF" : "Pendiente"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
