"use client";

import { useState, useEffect } from "react";
import { FileText, AlertTriangle, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface MissingField {
  key: string;
  label: string;
}

interface ContratoBorradorData {
  templateName: string;
  html: string;
  missingFields: MissingField[];
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <p className="text-sm text-slate-400">Cargando borrador de contrato...</p>
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

  const hasMissing = data.missingFields.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Missing fields warning */}
      {hasMissing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="text-sm text-amber-200 font-medium">
                Hay campos pendientes de completar
              </p>
              <p className="text-xs text-amber-200/70">
                Los campos resaltados en{" "}
                <span className="inline-block bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                  amarillo
                </span>{" "}
                necesitan ser completados. Puede ingresarlos en la sección{" "}
                <strong>&quot;Mi Empresa&quot;</strong> del portal.
              </p>
              <ul className="text-xs text-amber-200/60 list-disc list-inside space-y-0.5">
                {data.missingFields.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
              {data.canCompleteInPortal && onNavigateToEmpresa && (
                <button
                  onClick={onNavigateToEmpresa}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ir a Mi Empresa para completar datos
                </button>
              )}
            </div>
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
            "[&_p]:text-sm [&_p]:leading-relaxed",
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
