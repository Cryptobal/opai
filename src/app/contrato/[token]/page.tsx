"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Pencil,
  Send,
  CheckCircle2,
  Clock,
  FileText,
  FileDown,
  X,
  AlertTriangle,
  Loader2,
  Inbox,
} from "lucide-react";

interface ContractDocument {
  id: string;
  title: string;
  content: any;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  contractMetadata: {
    clauseEditability?: Record<string, boolean>;
    adjustmentType?: string;
    hasCCTV?: boolean;
    currency?: string;
    reviewSubmittedAt?: string;
  } | null;
  reviewSubmittedAt?: string | null;
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

const CLAUSE_ORDINALS = [
  "PRIMERA",
  "SEGUNDA",
  "TERCERA",
  "CUARTA",
  "QUINTA",
  "SEXTA",
  "SÉPTIMA",
  "SEPTIMA",
  "OCTAVA",
  "NOVENA",
  "DÉCIMA",
  "DECIMA",
  "UNDÉCIMA",
  "UNDECIMA",
  "DUODÉCIMA",
  "DUODECIMA",
  "DÉCIMA TERCERA",
  "DECIMA TERCERA",
  "DÉCIMA CUARTA",
  "DECIMA CUARTA",
  "DÉCIMA QUINTA",
  "DECIMA QUINTA",
  "DÉCIMA SEXTA",
  "DECIMA SEXTA",
];

const CLAUSE_REGEX = new RegExp(`^(${CLAUSE_ORDINALS.join("|")})`, "i");

export default function ContratoReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [doc, setDoc] = useState<ContractDocument | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `suggestionId` is set when the user re-opens an existing pending
  // suggestion to edit it; null means we're authoring a brand-new one.
  const [editingClause, setEditingClause] = useState<{
    suggestionId: string | null;
    clauseNumber: string;
    originalContent: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({ suggestedContent: "", clientNote: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sendingReview, setSendingReview] = useState(false);
  const [reviewJustSent, setReviewJustSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Suggestion | null>(null);

  const fetchDocument = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/cliente/contrato/${token}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDoc(data.data.document);
      setSuggestions(data.data.suggestions ?? []);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar el contrato");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const handleSuggest = async () => {
    if (!editingClause || !editForm.suggestedContent.trim()) return;
    setSubmitting(true);
    try {
      const isEditingExisting = Boolean(editingClause.suggestionId);
      const url = isEditingExisting
        ? `/api/portal/cliente/contract-suggestions/${editingClause.suggestionId}`
        : "/api/portal/cliente/contract-suggestions";
      const method = isEditingExisting ? "PATCH" : "POST";
      const body = isEditingExisting
        ? {
            contractClientToken: token,
            suggestedContent: editForm.suggestedContent,
            clientNote: editForm.clientNote || null,
          }
        : {
            contractClientToken: token,
            clauseNumber: editingClause.clauseNumber,
            clauseTitle: editingClause.clauseNumber,
            originalContent: editingClause.originalContent,
            suggestedContent: editForm.suggestedContent,
            clientNote: editForm.clientNote || null,
          };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEditingClause(null);
      setEditForm({ suggestedContent: "", clientNote: "" });
      setReviewJustSent(false);
      toast.success(isEditingExisting ? "Sugerencia actualizada" : "Sugerencia guardada");
      fetchDocument();
    } catch (e: any) {
      toast.error(e.message || "Error al guardar el comentario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSuggestion = async (suggestion: Suggestion) => {
    setDeleteTarget(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/contract-suggestions/${suggestion.id}?contractClientToken=${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "No se pudo eliminar el comentario");
      }
      toast.success("Comentario eliminado");
      fetchDocument();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar el comentario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReview = async () => {
    setSendingReview(true);
    try {
      const res = await fetch(`/api/portal/cliente/contrato/${token}/send-review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setReviewJustSent(true);
      toast.success("Revisión enviada");
      fetchDocument();
    } catch (e: any) {
      toast.error(e.message || "Error al enviar la revisión");
    } finally {
      setSendingReview(false);
    }
  };

  const handleAccept = async () => {
    setShowAcceptConfirm(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/cliente/contrato/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAccepted(true);
      fetchDocument();
    } catch (e: any) {
      toast.error(e.message || "Error al aceptar contrato");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewSubmittedAt = doc?.reviewSubmittedAt ?? null;

  const unsentPendingSuggestions = useMemo(() => {
    if (!reviewSubmittedAt) {
      return suggestions.filter((s) => s.status === "pending");
    }
    const submittedAt = new Date(reviewSubmittedAt).getTime();
    return suggestions.filter(
      (s) => s.status === "pending" && new Date(s.createdAt).getTime() > submittedAt
    );
  }, [suggestions, reviewSubmittedAt]);

  const awaitingResponseCount = useMemo(() => {
    if (!reviewSubmittedAt) return 0;
    const submittedAt = new Date(reviewSubmittedAt).getTime();
    return suggestions.filter(
      (s) => s.status === "pending" && new Date(s.createdAt).getTime() <= submittedAt
    ).length;
  }, [suggestions, reviewSubmittedAt]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-status-info-fg" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="flex items-center gap-3 text-status-danger-fg">
          <AlertTriangle className="h-5 w-5" />
          {error || "Contrato no encontrado"}
        </div>
      </div>
    );
  }

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const canAccept =
    pendingSuggestions.length === 0 &&
    !["approved", "active"].includes(doc.status);
  const isFinalized = ["approved", "active"].includes(doc.status);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sticky mobile-first header */}
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <StatusBadge status={doc.status} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-semibold leading-tight truncate">
                {doc.title}
              </h1>
              {(doc.effectiveDate || doc.expirationDate) && (
                <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
                  {doc.effectiveDate && <>Vigencia: {formatDate(doc.effectiveDate)}</>}
                  {doc.expirationDate && <> — {formatDate(doc.expirationDate)}</>}
                </p>
              )}
            </div>
            <a
              href={`/api/portal/cliente/contrato/${token}/docx`}
              download
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-[11px] sm:text-xs font-medium min-h-[36px]"
              title="Descargar borrador en Word"
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Descargar Word</span>
              <span className="sm:hidden">Word</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 sm:py-6 space-y-4 pb-40">
        {/* Acceptance banner */}
        {accepted && (
          <div className="p-4 bg-status-info-soft border border-status-info-border rounded-lg text-status-info-fg text-sm flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              Contrato aceptado. Recibirá un correo con los pasos siguientes para la firma.
            </div>
          </div>
        )}

        {/* Onboarding help (only while draft, no suggestions yet) */}
        {!isFinalized && suggestions.length === 0 && !accepted && (
          <div className="p-4 rounded-lg border border-status-info-border bg-status-info-soft text-sm text-status-info-fg flex items-start gap-3">
            <Pencil className="h-4 w-4 shrink-0 mt-0.5 text-status-info-fg" />
            <div className="space-y-1">
              <p className="font-medium">¿Necesita cambios?</p>
              <p className="text-status-info-fg/80 text-xs leading-relaxed">
                Toque el botón{" "}
                <span className="inline-flex items-center gap-1 bg-status-info-soft text-status-info-fg px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle">
                  <Pencil className="h-2.5 w-2.5" /> Sugerir edición
                </span>{" "}
                junto a cualquier cláusula. Cuando termine, presione{" "}
                <strong>Enviar revisión</strong> al final para que la empresa reciba
                todos sus comentarios juntos.
              </p>
            </div>
          </div>
        )}

        {/* Suggestions summary */}
        {suggestions.length > 0 && (
          <SuggestionsPanel
            suggestions={suggestions}
            unsentCount={unsentPendingSuggestions.length}
            awaitingResponseCount={awaitingResponseCount}
            reviewJustSent={reviewJustSent}
            onEdit={(s) => {
              setEditingClause({
                suggestionId: s.id,
                clauseNumber: s.clauseNumber,
                originalContent: s.originalContent,
              });
              setEditForm({
                suggestedContent: s.suggestedContent,
                clientNote: s.clientNote ?? "",
              });
            }}
            onDelete={(s) => setDeleteTarget(s)}
          />
        )}

        {/* Contract body */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-6">
          <ContractContent
            content={doc.content}
            docStatus={doc.status}
            onSuggestEdit={(clauseNumber, originalContent) => {
              // If there's already a pending suggestion for this clause, open
              // it in edit mode instead of authoring a duplicate. Preserves
              // the user's previous draft text when re-clicking "Sugerir
              // edición" on the same clause.
              const existing = suggestions.find(
                (s) => s.status === "pending" && s.clauseNumber === clauseNumber,
              );
              setEditingClause({
                suggestionId: existing?.id ?? null,
                clauseNumber,
                originalContent: existing?.originalContent ?? originalContent,
              });
              setEditForm({
                suggestedContent: existing?.suggestedContent ?? originalContent,
                clientNote: existing?.clientNote ?? "",
              });
            }}
          />
        </div>

        {pendingSuggestions.length > 0 && (
          <p className="text-center text-xs text-status-warn-fg/80 px-2">
            Tiene {pendingSuggestions.length} sugerencia(s) en revisión. Podrá aceptar el
            contrato una vez que el ejecutivo las resuelva.
          </p>
        )}
      </main>

      {/* Sticky bottom action bar */}
      {!isFinalized && !accepted && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-zinc-950/95 backdrop-blur border-t border-zinc-800">
          <div className="max-w-4xl mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {unsentPendingSuggestions.length > 0 ? (
              <button
                onClick={handleSendReview}
                disabled={sendingReview}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-status-info hover:bg-status-info text-white rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform"
              >
                {sendingReview ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                {sendingReview
                  ? "Enviando..."
                  : `Enviar revisión (${unsentPendingSuggestions.length} ${
                      unsentPendingSuggestions.length === 1 ? "cambio" : "cambios"
                    })`}
              </button>
            ) : awaitingResponseCount > 0 ? (
              <div className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-zinc-800/80 text-zinc-300 rounded-lg font-medium text-sm">
                <Inbox className="h-4 w-4 text-status-warn-fg" />
                Esperando respuesta del ejecutivo ({awaitingResponseCount} en revisión)
              </div>
            ) : canAccept ? (
              <button
                onClick={() => setShowAcceptConfirm(true)}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-status-info hover:bg-status-info text-white rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.99] transition-transform"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                {submitting ? "Procesando..." : "Aceptar contrato"}
              </button>
            ) : null}

            {/* Helper line */}
            {unsentPendingSuggestions.length === 0 && canAccept && (
              <p className="text-[11px] text-zinc-500 text-center mt-2">
                O sugiera cambios tocando cualquier cláusula editable.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Edit suggestion modal */}
      {editingClause && (
        <EditSuggestionModal
          mode={editingClause.suggestionId ? "edit" : "create"}
          clauseNumber={editingClause.clauseNumber}
          originalContent={editingClause.originalContent}
          suggestedContent={editForm.suggestedContent}
          clientNote={editForm.clientNote}
          submitting={submitting}
          onChangeSuggested={(v) => setEditForm((f) => ({ ...f, suggestedContent: v }))}
          onChangeNote={(v) => setEditForm((f) => ({ ...f, clientNote: v }))}
          onCancel={() => setEditingClause(null)}
          onSubmit={handleSuggest}
        />
      )}

      {/* Accept contract confirmation (replaces native confirm()) */}
      {showAcceptConfirm && (
        <AcceptConfirmModal
          submitting={submitting}
          onCancel={() => setShowAcceptConfirm(false)}
          onConfirm={handleAccept}
        />
      )}

      {/* Delete suggestion confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          clauseNumber={deleteTarget.clauseNumber}
          submitting={submitting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteSuggestion(deleteTarget)}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    draft: {
      label: "Borrador",
      bg: "bg-zinc-800",
      text: "text-zinc-100",
      border: "border-zinc-600",
      icon: <FileText className="h-3 w-3" />,
    },
    review: {
      label: "En revisión",
      bg: "bg-status-warn-soft",
      text: "text-status-warn-fg",
      border: "border-status-warn-border",
      icon: <Clock className="h-3 w-3" />,
    },
    approved: {
      label: "Aprobado",
      bg: "bg-status-info-soft",
      text: "text-status-info-fg",
      border: "border-status-info-border",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    active: {
      label: "Activo",
      bg: "bg-status-info-soft",
      text: "text-status-info-fg",
      border: "border-status-info-border",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  };
  const cfg = map[status] ?? map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function SuggestionsPanel({
  suggestions,
  unsentCount,
  awaitingResponseCount,
  reviewJustSent,
  onEdit,
  onDelete,
}: {
  suggestions: Suggestion[];
  unsentCount: number;
  awaitingResponseCount: number;
  reviewJustSent: boolean;
  onEdit: (s: Suggestion) => void;
  onDelete: (s: Suggestion) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Pencil className="h-4 w-4 text-status-info-fg" />
          Mis comentarios
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {unsentCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-status-info-soft text-status-info-fg border border-status-info-border">
              {unsentCount} por enviar
            </span>
          )}
          {awaitingResponseCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-status-warn-soft text-status-warn-fg border border-status-warn-border">
              {awaitingResponseCount} esperando
            </span>
          )}
          {reviewJustSent && unsentCount === 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-status-info-soft text-status-info-fg border border-status-info-border">
              Enviado ✓
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onEdit={() => onEdit(s)}
            onDelete={() => onDelete(s)}
          />
        ))}
      </ul>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onEdit,
  onDelete,
}: {
  suggestion: Suggestion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const s = suggestion;
  const canMutate = s.status === "pending";
  return (
    <li
      className={`rounded-md border text-xs overflow-hidden ${
        s.status === "pending"
          ? "border-status-warn-border bg-status-warn-soft"
          : s.status === "approved"
            ? "border-status-info-border bg-status-info-soft"
            : "border-status-danger-border bg-status-danger-soft"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5">
        <span className="font-medium text-zinc-200">Cláusula {s.clauseNumber}</span>
        <span
          className={
            s.status === "pending"
              ? "text-status-warn-fg"
              : s.status === "approved"
                ? "text-status-info-fg"
                : "text-status-danger-fg"
          }
        >
          {s.status === "pending"
            ? "Pendiente"
            : s.status === "approved"
              ? "Aprobada"
              : "Rechazada"}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">
            Texto original
          </p>
          <p className="text-zinc-400 whitespace-pre-wrap line-clamp-4 leading-relaxed">
            {s.originalContent}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">
            Su propuesta
          </p>
          <p className="text-zinc-100 whitespace-pre-wrap leading-relaxed">
            {s.suggestedContent}
          </p>
        </div>
        {s.clientNote && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">
              Nota
            </p>
            <p className="text-zinc-300 whitespace-pre-wrap italic leading-relaxed">
              {s.clientNote}
            </p>
          </div>
        )}
        {s.adminComment && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-0.5">
              Respuesta del ejecutivo
            </p>
            <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {s.adminComment}
            </p>
          </div>
        )}
      </div>
      {canMutate && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5 bg-black/10">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-status-info-soft hover:brightness-110 text-status-info-fg border border-status-info-border"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-status-danger-soft hover:bg-status-danger-soft text-status-danger-fg border border-status-danger-border"
          >
            <X className="h-3 w-3" />
            Eliminar
          </button>
        </div>
      )}
    </li>
  );
}

function EditSuggestionModal({
  mode,
  clauseNumber,
  originalContent,
  suggestedContent,
  clientNote,
  submitting,
  onChangeSuggested,
  onChangeNote,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  clauseNumber: string;
  originalContent: string;
  suggestedContent: string;
  clientNote: string;
  submitting: boolean;
  onChangeSuggested: (v: string) => void;
  onChangeNote: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const title =
    mode === "edit"
      ? `Editar comentario — Cláusula ${clauseNumber}`
      : `Sugerir edición — Cláusula ${clauseNumber}`;
  const submitLabel = mode === "edit" ? "Actualizar comentario" : "Guardar comentario";
  const submitBusyLabel = mode === "edit" ? "Actualizando..." : "Guardando...";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-zinc-900 border-t sm:border border-zinc-700 w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="p-2 -m-2 text-zinc-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Texto original</label>
            <div className="text-sm bg-zinc-800 p-3 rounded border border-zinc-700 max-h-36 overflow-y-auto whitespace-pre-wrap text-zinc-300">
              {originalContent}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Su propuesta</label>
            <textarea
              value={suggestedContent}
              onChange={(e) => onChangeSuggested(e.target.value)}
              className="w-full h-40 sm:h-44 bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">
              Nota (opcional)
            </label>
            <textarea
              value={clientNote}
              onChange={(e) => onChangeNote(e.target.value)}
              placeholder="Explique brevemente el motivo de la modificación..."
              className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex-1 sm:flex-none px-4 py-2.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-200"
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !suggestedContent.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-status-info hover:bg-status-info rounded text-white font-medium disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            {submitting ? submitBusyLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  clauseNumber,
  submitting,
  onCancel,
  onConfirm,
}: {
  clauseNumber: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-zinc-900 border-t sm:border border-zinc-700 w-full sm:max-w-md sm:rounded-xl rounded-t-xl">
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-status-danger-soft border border-status-danger-border flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-status-danger-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-zinc-100">Eliminar comentario</h3>
            <p className="mt-1 text-sm text-zinc-400">
              ¿Eliminar el comentario de la cláusula {clauseNumber}? Esta acción no se
              puede deshacer.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 border-t border-zinc-800">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-status-danger hover:bg-status-danger rounded text-white font-semibold disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {submitting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AcceptConfirmModal({
  submitting,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-zinc-900 border-t sm:border border-zinc-700 w-full sm:max-w-md sm:rounded-xl rounded-t-xl">
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-status-info-soft border border-status-info-border flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-status-info-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-zinc-100">Aceptar contrato</h3>
            <p className="mt-1 text-sm text-zinc-400">
              ¿Confirma que acepta el contrato tal como está? Esta acción no se puede
              deshacer.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 border-t border-zinc-800">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 text-zinc-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-status-info hover:bg-status-info rounded text-white font-semibold disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {submitting ? "Procesando..." : "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Render contract content grouped by clause; Sugerir edición button visible
 * next to each clause title on every viewport (no hover required). */
function ContractContent({
  content,
  onSuggestEdit,
  docStatus,
}: {
  content: any;
  onSuggestEdit: (clauseNumber: string, originalContent: string) => void;
  docStatus: string;
}) {
  if (!content || !content.content) return null;
  const nodes = content.content as any[];
  // "in_review" is the status set by POST /api/docs/documents/[id]/send-review
  // when the company pushes the draft to the client portal. "review" is kept for
  // backward compatibility with older documents.
  const canEdit = ["draft", "review", "in_review"].includes(docStatus);

  // Group nodes into [preamble, clause1, clause2, ...] based on headings whose
  // text starts with a Spanish ordinal.
  type Section =
    | { kind: "preamble"; nodes: any[] }
    | { kind: "clause"; clauseNumber: string; heading: any; nodes: any[] };

  const sections: Section[] = [];
  let current: Section | null = null;

  for (const node of nodes) {
    if (node?.type === "heading") {
      const text = getNodeText(node).trim();
      const match = text.match(CLAUSE_REGEX);
      if (match) {
        if (current) sections.push(current);
        current = {
          kind: "clause",
          clauseNumber: match[1].toUpperCase(),
          heading: node,
          nodes: [],
        };
        continue;
      }
    }
    if (!current) {
      current = { kind: "preamble", nodes: [] };
    }
    current.nodes.push(node);
  }
  if (current) sections.push(current);

  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {sections.map((section, i) => {
        if (section.kind === "preamble") {
          return (
            <div key={`pre-${i}`}>
              {section.nodes.map((n, j) => (
                <TiptapNodeRender key={j} node={n} />
              ))}
            </div>
          );
        }
        const bodyText = section.nodes.map(getNodeText).join("\n\n").trim();
        return (
          <section key={`c-${i}`} className="not-prose mt-6 first:mt-0">
            <div className="flex items-start sm:items-center gap-2 flex-wrap mb-2">
              <TiptapHeading node={section.heading} />
              {canEdit && bodyText.length > 0 && (
                <button
                  onClick={() => onSuggestEdit(section.clauseNumber, bodyText)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-status-info-soft text-status-info-fg hover:brightness-110 active:brightness-95 border border-status-info-border text-[11px] font-semibold min-h-[32px]"
                >
                  <Pencil className="h-3 w-3" />
                  Sugerir edición
                </button>
              )}
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              {section.nodes.map((n, j) => (
                <TiptapNodeRender key={j} node={n} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TiptapHeading({ node }: { node: any }) {
  const children = (node.content ?? []).map((child: any, i: number) => (
    <TiptapNodeRender key={i} node={child} />
  ));
  const level = node.attrs?.level ?? 2;
  const cls = "font-bold text-zinc-100 m-0";
  if (level === 1) return <h1 className={`${cls} text-lg`}>{children}</h1>;
  if (level === 3) return <h3 className={`${cls} text-sm`}>{children}</h3>;
  return <h2 className={`${cls} text-base`}>{children}</h2>;
}

function TiptapNodeRender({ node }: { node: any }) {
  if (!node) return null;

  if (node.type === "text") {
    let text = node.text ?? "";
    const marks = node.marks ?? [];
    let el: React.ReactNode = text;
    for (const mark of marks) {
      if (mark.type === "bold") el = <strong>{el}</strong>;
      if (mark.type === "italic") el = <em>{el}</em>;
      if (mark.type === "underline") el = <u>{el}</u>;
    }
    return <>{el}</>;
  }

  if (node.type === "paragraph") {
    return (
      <p className="mb-3 leading-relaxed text-zinc-200">
        {(node.content ?? []).map((child: any, i: number) => (
          <TiptapNodeRender key={i} node={child} />
        ))}
      </p>
    );
  }

  if (node.type === "heading") {
    return <TiptapHeading node={node} />;
  }

  if (node.type === "horizontalRule") {
    return <hr className="border-zinc-700 my-6" />;
  }

  if (node.type === "hardBreak") {
    return <br />;
  }

  if (node.content) {
    return (
      <div>
        {node.content.map((child: any, i: number) => (
          <TiptapNodeRender key={i} node={child} />
        ))}
      </div>
    );
  }

  return null;
}

function getNodeText(node: any): string {
  if (!node) return "";
  if (node.type === "text" && node.text != null) return String(node.text);
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(getNodeText).join("");
  }
  return "";
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("es-CL");
  } catch {
    return date;
  }
}
