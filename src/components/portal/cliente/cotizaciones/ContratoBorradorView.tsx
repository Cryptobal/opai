"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Download,
  Info,
  Pencil,
  X,
  Send,
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

interface Suggestion {
  id: string;
  clauseNumber: string;
  clauseTitle: string;
  originalContent: string;
  suggestedContent: string;
  clientNote: string | null;
  adminComment: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editModal, setEditModal] = useState<{
    clauseNumber: string;
    clauseTitle: string;
    originalText: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({ suggestedContent: "", clientNote: "" });
  const [submitting, setSubmitting] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

  const fetchDraft = useCallback(() => {
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

  const fetchSuggestions = useCallback(() => {
    fetch(`/api/portal/cliente/contract-suggestions?quoteId=${quoteId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSuggestions(json.data ?? []);
      })
      .catch(() => {});
  }, [quoteId]);

  useEffect(() => {
    fetchDraft();
    fetchSuggestions();
  }, [fetchDraft, fetchSuggestions]);

  // Set contract HTML once and inject buttons — use a callback ref
  // so React never re-renders the innerHTML (which would destroy buttons).
  const [contractMounted, setContractMounted] = useState(false);
  const [injectTick, setInjectTick] = useState(0);

  const contractCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      (contractRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (node && data?.html) {
        node.innerHTML = data.html;
        setContractMounted(true);
      }
    },
    [data?.html]
  );

  useEffect(() => {
    if (!contractMounted || !contractRef.current) return;
    const container = contractRef.current;
    container.querySelectorAll("[data-suggest-btn]").forEach((b) => b.remove());
    container.querySelectorAll<HTMLElement>("[data-clause-id]").forEach((el) => {
      const clauseId = el.getAttribute("data-clause-id");
      if (!clauseId) return;
      if (el.querySelector("[data-suggest-btn]")) return;
      const clauseTitle = el.textContent?.trim() ?? clauseId;
      const btn = document.createElement("button");
      btn.setAttribute("data-suggest-btn", clauseId);
      btn.className =
        "ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-700 hover:bg-teal-500/30 transition-colors align-middle cursor-pointer";
      btn.style.cssText = "display:inline-flex !important; visibility:visible !important;";
      btn.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> Sugerir edición';
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const paragraphs: string[] = [];
        let sibling = el.nextElementSibling;
        while (sibling && !sibling.tagName.match(/^H[1-4]$/)) {
          const pText = sibling.textContent?.trim();
          if (pText) paragraphs.push(pText);
          sibling = sibling.nextElementSibling;
        }
        const originalText = paragraphs.join("\n\n");
        setEditModal({ clauseNumber: clauseId, clauseTitle, originalText });
        setEditForm({ suggestedContent: originalText, clientNote: "" });
      });
      el.appendChild(btn);
    });
  }, [contractMounted, injectTick]);

  async function handleDownloadPdf() {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/cotizaciones/${quoteId}/contrato-borrador-pdf`
      );
      if (!res.ok) throw new Error("No se pudo generar el PDF");
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
      toast.error(e instanceof Error ? e.message : "Error al generar el borrador");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSubmitSuggestion() {
    if (!editModal || !editForm.suggestedContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/cliente/contract-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          clauseNumber: editModal.clauseNumber,
          clauseTitle: editModal.clauseTitle,
          originalContent: editModal.originalText,
          suggestedContent: editForm.suggestedContent,
          clientNote: editForm.clientNote || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Sugerencia enviada correctamente. Será revisada por el ejecutivo.");
      setEditModal(null);
      fetchSuggestions();
      // Re-inject buttons after a small delay (React may re-render the contract div)
      setTimeout(() => setInjectTick((t) => t + 1), 100);
    } catch (e: any) {
      toast.error(e.message || "Error al enviar sugerencia");
    } finally {
      setSubmitting(false);
    }
  }

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
        <button onClick={onBack} className="mt-2 text-sm text-teal-400 hover:text-teal-300 underline underline-offset-2">
          Volver a la propuesta
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasPortalMissing = data.missingFields.length > 0;
  const hasContractual = data.contractualFields?.length > 0;
  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");

  return (
    <div className="space-y-4">
      {/* Header + Download */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-400" />
            <h3 className="text-sm font-semibold text-white">Borrador de Contrato</h3>
          </div>
        </div>

        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {pdfLoading ? "Generando..." : "Descargar PDF"}
        </button>
      </div>

      {/* Suggestions status */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-teal-300 flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Mis sugerencias de edición
            {pendingSuggestions.length > 0 && (
              <span className="bg-yellow-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {pendingSuggestions.length} pendiente(s)
              </span>
            )}
          </h4>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "rounded-lg border p-3 text-xs",
                  s.status === "pending" ? "border-yellow-600/30 bg-yellow-500/5" :
                  s.status === "approved" ? "border-green-600/30 bg-green-500/5" :
                  "border-red-600/30 bg-red-500/5"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-200">Cláusula {s.clauseNumber}</span>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded",
                    s.status === "pending" ? "bg-yellow-600/20 text-yellow-400" :
                    s.status === "approved" ? "bg-green-600/20 text-green-400" :
                    "bg-red-600/20 text-red-400"
                  )}>
                    {s.status === "pending" ? "Pendiente de revisión" : s.status === "approved" ? "Aprobada" : "Rechazada"}
                  </span>
                </div>
                {s.clientNote && <p className="text-slate-400 italic mb-1">Nota: {s.clientNote}</p>}
                {s.adminComment && (
                  <p className="text-slate-300 mt-1">
                    <span className="font-medium">Respuesta:</span> {s.adminComment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editable clauses info */}
      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3">
        <div className="flex items-start gap-2">
          <Pencil className="h-3.5 w-3.5 text-teal-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-teal-400/80 leading-relaxed">
            Puede sugerir modificaciones en cualquier cláusula del contrato.
            Haga clic en el botón{" "}
            <span className="inline-flex items-center gap-0.5 bg-teal-500/20 text-teal-700 px-1 py-0.5 rounded text-[10px] font-semibold">
              <Pencil className="h-2.5 w-2.5" /> Sugerir edición
            </span>{" "}
            junto al título de la cláusula.
          </p>
        </div>
      </div>

      {/* Portal missing fields */}
      {hasPortalMissing && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="text-sm text-amber-200 font-medium">Hay datos de su empresa pendientes de completar</p>
              <p className="text-xs text-amber-200/70">
                Los campos resaltados en{" "}
                <span className="inline-block bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-semibold">amarillo</span>{" "}
                se pueden completar desde el menú <strong>&quot;Más&quot;</strong> &rarr; <strong>&quot;Empresa&quot;</strong> en la barra inferior.
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

      {/* Contractual fields */}
      {hasContractual && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Los campos marcados como{" "}
              <span className="inline-block bg-slate-200 text-slate-600 px-1 py-0.5 rounded text-[10px] italic">A definir al firmar</span>{" "}
              serán completados al momento de formalizar el contrato (
              {data.contractualFields.map((f) => f.label).join(", ")}).
            </p>
          </div>
        </div>
      )}

      {/* Contract HTML */}
      <div className="rounded-xl border border-slate-700/50 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500 font-medium">
            {data.templateName} — Borrador (no vinculante)
          </p>
        </div>
        <div
          ref={contractCallbackRef}
          className={cn(
            "px-8 py-6 prose prose-sm max-w-none",
            "text-slate-800",
            "[&_table]:border-collapse [&_table]:w-full",
            "[&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold",
            "[&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs",
            "[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm",
            "[&_p]:text-sm [&_p]:leading-relaxed"
          )}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-center text-[10px] text-slate-600 px-4">
        Este es un borrador informativo basado en la propuesta comercial. El contrato definitivo será preparado y enviado formalmente para su revisión y firma.
      </p>

      {/* Edit suggestion modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                Sugerir edición — {editModal.clauseTitle}
              </h3>
              <button onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Texto original de la cláusula</label>
              <div className="text-sm bg-zinc-800 border border-zinc-700 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-slate-300">
                {editModal.originalText}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Su propuesta de modificación</label>
              <textarea
                value={editForm.suggestedContent}
                onChange={(e) => setEditForm((f) => ({ ...f, suggestedContent: e.target.value }))}
                className="w-full h-44 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Motivo o nota (opcional)</label>
              <textarea
                value={editForm.clientNote}
                onChange={(e) => setEditForm((f) => ({ ...f, clientNote: e.target.value }))}
                placeholder="Explique brevemente por qué solicita esta modificación..."
                className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditModal(null)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 text-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitSuggestion}
                disabled={submitting || !editForm.suggestedContent.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 rounded-lg text-white font-medium disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Enviando..." : "Enviar sugerencia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
