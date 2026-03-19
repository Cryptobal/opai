"use client";

import { useState } from "react";
import { Check, XCircle, FileDown, FileText, MessageSquare, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { WhatsAppButton } from "./WhatsAppButton";

interface ProposalTotalAccionesProps {
  quoteId: string;
  monthlyCost: number;
  currency: string;
  canAct: boolean;
  context: "prospect" | "client";
  cotizacionCode: string;
  onApprove?: () => void;
  onReject?: () => void;
  onConsult?: () => void;
  onViewProposal?: () => void;
  className?: string;
}

export function ProposalTotalAcciones({
  quoteId,
  monthlyCost,
  currency,
  canAct,
  context,
  cotizacionCode,
  onApprove,
  onReject,
  onConsult,
  onViewProposal,
  className,
}: ProposalTotalAccionesProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [proposalPdfLoading, setProposalPdfLoading] = useState(false);
  const currencyKey = currency === "UF" ? "UF" : "CLP";

  async function handleDownloadProposalPdf() {
    if (proposalPdfLoading) return;
    setProposalPdfLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${quoteId}/proposal-pdf`);
      if (!res.ok) throw new Error("Error al generar propuesta técnica");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      // Silent
    } finally {
      setProposalPdfLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/portal/cliente/cotizaciones/${quoteId}/pdf`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `cotizacion-${quoteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silent
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Total */}
      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 px-4 py-4">
        <p className="text-xs uppercase tracking-wider text-emerald-500 font-semibold mb-1">
          Total Mensual
        </p>
        <p className="text-2xl font-bold text-white font-mono">
          {formatCurrency(monthlyCost, currencyKey)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canAct && onApprove && (
          <button
            type="button"
            onClick={onApprove}
            className="flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}
          >
            <Check className="w-4 h-4" />
            {context === "prospect" ? "Aceptar propuesta" : "Aprobar cotización"}
          </button>
        )}

        {canAct && onReject && (
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-2 px-4 h-10 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Rechazar
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="flex items-center gap-2 px-4 h-10 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 text-sm transition-colors disabled:opacity-50"
        >
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {pdfLoading ? "Generando..." : "Descargar PDF"}
        </button>

        <button
          type="button"
          onClick={handleDownloadProposalPdf}
          disabled={proposalPdfLoading}
          className="flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(20,184,166,0.18), rgba(6,182,212,0.12))",
            border: "1px solid rgba(45,212,191,0.4)",
            color: "#5eead4",
          }}
        >
          {proposalPdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {proposalPdfLoading ? "Generando..." : "Ver Propuesta Técnica"}
        </button>

        {onViewProposal && (
          <button
            type="button"
            onClick={onViewProposal}
            className="flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(20,184,166,0.18), rgba(6,182,212,0.12))",
              border: "1px solid rgba(45,212,191,0.4)",
              color: "#5eead4",
            }}
          >
            <FileText className="w-4 h-4" />
            Propuesta técnica
          </button>
        )}

        {onConsult && (
          <button
            type="button"
            onClick={onConsult}
            className="flex items-center gap-2 px-4 h-10 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Consultar
          </button>
        )}

        <WhatsAppButton
          variant="compact"
          context={context}
          cotizacionCode={cotizacionCode}
        />
      </div>

      {/* Footer */}
      <div className="text-center pt-3 border-t border-white/[0.04]">
        <p className="text-[10px] text-slate-600">
          Propuesta generada en plataforma OPAI ·{" "}
          <a
            href="https://lx3.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-slate-400 transition-colors"
          >
            lx3.ai
          </a>
        </p>
      </div>
    </div>
  );
}
