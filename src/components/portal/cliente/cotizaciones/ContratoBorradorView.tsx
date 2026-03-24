"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Download,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MissingField {
  key: string;
  label: string;
}

interface ContratoBorradorData {
  templateName: string;
  html: string;
  missingFields: MissingField[];
  contractualFields: MissingField[];
  canCompleteInPortal: boolean;
}

interface Props {
  quoteId: string;
  onBack: () => void;
  onNavigateToEmpresa?: () => void;
}

export function ContratoBorradorView({ quoteId, onBack, onNavigateToEmpresa }: Props) {
  const [data, setData] = useState<ContratoBorradorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/portal/cliente/cotizaciones/${quoteId}/contrato-borrador`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error ?? "Error al cargar borrador de contrato");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [quoteId]);

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/cotizaciones/${quoteId}/contrato-borrador-pdf`
      );
      if (!res.ok) {
        throw new Error("No se pudo generar el PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^";\n]+)"?/);
      a.download = match?.[1] ?? `Borrador-Contrato.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Borrador descargado");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al generar el borrador"
      );
    } finally {
      setPdfLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <p className="text-sm text-slate-400">
          Cargando borrador de contrato...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-slate-300">{error}</p>
        <button
          onClick={onBack}
          className="mt-2 text-sm text-teal-400 hover:text-teal-300 underline underline-offset-2"
        >
          Volver a la propuesta
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasPortalMissing = data.missingFields.length > 0;
  const hasContractual = data.contractualFields?.length > 0;

  return (
    <div className="space-y-4">
      {/* Header + Download */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-white">
              Borrador de Contrato
            </h3>
          </div>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {pdfLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {pdfLoading ? "Generando..." : "Descargar PDF"}
        </button>
      </div>

      {/* Portal missing fields — client can complete these */}
      {hasPortalMissing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="text-sm text-amber-200 font-medium">
                Hay datos de su empresa pendientes de completar
              </p>
              <p className="text-xs text-amber-200/70">
                Los campos resaltados en{" "}
                <span className="inline-block bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                  amarillo
                </span>{" "}
                se pueden completar desde el menú{" "}
                <strong>&quot;Más&quot;</strong> &rarr;{" "}
                <strong>&quot;Empresa&quot;</strong> en la barra inferior.
              </p>
              <ul className="text-xs text-amber-200/60 list-disc list-inside space-y-0.5">
                {data.missingFields.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
              {onNavigateToEmpresa && (
                <button
                  onClick={onNavigateToEmpresa}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-xs font-medium text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 transition-colors"
                >
                  Ir a Empresa para completar datos
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contractual fields — determined at signing */}
      {hasContractual && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Los campos marcados como{" "}
              <span className="inline-block bg-slate-200 text-slate-600 px-1 py-0.5 rounded text-[10px] italic">
                A definir al firmar
              </span>{" "}
              serán completados al momento de formalizar el contrato (
              {data.contractualFields.map((f) => f.label).join(", ")}).
            </p>
          </div>
        </div>
      )}

      {/* Contract HTML — generated server-side by tiptapToPreviewHtml, same
          trusted-source pattern used across DocDetailClient, SignedViewClient,
          DocPreviewDialog, etc. */}
      <div className="rounded-xl border border-slate-700/50 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500 font-medium">
            {data.templateName} — Borrador (no vinculante)
          </p>
        </div>
        <div
          className={cn(
            "px-8 py-6 prose prose-sm max-w-none",
            "text-slate-800",
            "[&_table]:border-collapse [&_table]:w-full",
            "[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold",
            "[&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs",
            "[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm",
            "[&_p]:text-sm [&_p]:leading-relaxed"
          )}
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-slate-600 px-4">
        Este es un borrador informativo basado en la propuesta comercial. El
        contrato definitivo será preparado y enviado formalmente para su
        revisión y firma.
      </p>
    </div>
  );
}
