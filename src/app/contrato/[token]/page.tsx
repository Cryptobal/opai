"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface ContractDocument {
  id: string;
  title: string;
  content: any;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  contractMetadata: {
    clauseEditability: Record<string, boolean>;
    adjustmentType: string;
    hasCCTV: boolean;
    currency: string;
  } | null;
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

export default function ContratoReviewPage() {
  const params = useParams();
  const token = params.token as string;

  const [doc, setDoc] = useState<ContractDocument | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingClause, setEditingClause] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ originalContent: "", suggestedContent: "", clientNote: "" });
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

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
      const clauseTitle = editingClause;
      const res = await fetch("/api/portal/cliente/contract-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractClientToken: token,
          clauseNumber: editingClause,
          clauseTitle,
          originalContent: editForm.originalContent,
          suggestedContent: editForm.suggestedContent,
          clientNote: editForm.clientNote || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setEditingClause(null);
      setEditForm({ originalContent: "", suggestedContent: "", clientNote: "" });
      fetchDocument();
    } catch (e: any) {
      alert(e.message || "Error al enviar sugerencia");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!confirm("¿Confirma que acepta el contrato? Esta acción no se puede deshacer.")) return;
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
      alert(e.message || "Error al aceptar contrato");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Cargando contrato...</div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-red-400">{error || "Contrato no encontrado"}</div>
      </div>
    );
  }

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const canAccept = pendingSuggestions.length === 0 && doc.status !== "approved" && doc.status !== "active";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{doc.title}</h1>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span>Estado: <span className="text-teal-400 font-medium">{getStatusLabel(doc.status)}</span></span>
            {doc.effectiveDate && <span>Vigencia: {formatDate(doc.effectiveDate)} — {formatDate(doc.expirationDate)}</span>}
          </div>
          {accepted && (
            <div className="mt-4 p-3 bg-teal-900/30 border border-teal-700 rounded-lg text-teal-300">
              Contrato aceptado exitosamente. Recibirá un correo con los pasos siguientes para la firma.
            </div>
          )}
        </div>

        {/* Suggestions status */}
        {suggestions.length > 0 && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Sugerencias de edición</h3>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span>Cláusula {s.clauseNumber}</span>
                  <span className={
                    s.status === "pending" ? "text-yellow-400" :
                    s.status === "approved" ? "text-green-400" : "text-red-400"
                  }>
                    {s.status === "pending" ? "Pendiente" : s.status === "approved" ? "Aprobada" : "Rechazada"}
                    {s.adminComment && ` — ${s.adminComment}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contract content rendered as clauses */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <ContractContent
            content={doc.content}
            clauseEditability={doc.contractMetadata?.clauseEditability ?? {}}
            onSuggestEdit={(clauseNumber, originalContent) => {
              setEditingClause(clauseNumber);
              setEditForm({ originalContent, suggestedContent: originalContent, clientNote: "" });
            }}
            docStatus={doc.status}
          />
        </div>

        {/* Edit suggestion modal */}
        {editingClause && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Sugerir edición — Cláusula {editingClause}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Texto original</label>
                  <div className="text-sm bg-zinc-800 p-3 rounded border border-zinc-700 max-h-40 overflow-y-auto">
                    {editForm.originalContent}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Su propuesta</label>
                  <textarea
                    value={editForm.suggestedContent}
                    onChange={(e) => setEditForm((f) => ({ ...f, suggestedContent: e.target.value }))}
                    className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Nota (opcional)</label>
                  <textarea
                    value={editForm.clientNote}
                    onChange={(e) => setEditForm((f) => ({ ...f, clientNote: e.target.value }))}
                    placeholder="Explique brevemente el motivo de la modificación..."
                    className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setEditingClause(null)}
                    className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSuggest}
                    disabled={submitting || !editForm.suggestedContent.trim()}
                    className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 rounded text-white disabled:opacity-50"
                  >
                    {submitting ? "Enviando..." : "Enviar sugerencia"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accept button */}
        {canAccept && !accepted && (
          <div className="flex justify-center">
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg text-lg disabled:opacity-50"
            >
              {submitting ? "Procesando..." : "Aceptar Contrato"}
            </button>
          </div>
        )}

        {pendingSuggestions.length > 0 && (
          <div className="text-center text-sm text-yellow-400 mt-4">
            Tiene {pendingSuggestions.length} sugerencia(s) pendiente(s) de revisión. Podrá aceptar el contrato una vez resueltas.
          </div>
        )}
      </div>
    </div>
  );
}

/** Render contract content, with edit buttons on editable clauses */
function ContractContent({
  content,
  clauseEditability,
  onSuggestEdit,
  docStatus,
}: {
  content: any;
  clauseEditability: Record<string, boolean>;
  onSuggestEdit: (clauseNumber: string, originalContent: string) => void;
  docStatus: string;
}) {
  if (!content || !content.content) return null;

  const nodes = content.content as any[];
  const elements: React.ReactNode[] = [];
  let currentClause: string | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = getNodeText(node);

    // Detect clause headings
    if (node.type === "heading") {
      const clauseMatch = text.match(/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|UNDÉCIMA|DUODÉCIMA|DÉCIMA TERCERA|DÉCIMA CUARTA|DÉCIMA QUINTA|DÉCIMA SEXTA)/);
      if (clauseMatch) {
        currentClause = clauseMatch[1];
      }
    }

    const isEditable = currentClause && clauseEditability[currentClause] === true;
    const canEdit = isEditable && ["draft", "review"].includes(docStatus);

    elements.push(
      <div key={i} className="relative group">
        <TiptapNodeRender node={node} />
        {canEdit && node.type === "paragraph" && text.trim().length > 20 && (
          <button
            onClick={() => onSuggestEdit(currentClause!, text)}
            className="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded"
          >
            Editar
          </button>
        )}
      </div>
    );
  }

  return <div className="prose prose-invert prose-sm max-w-none">{elements}</div>;
}

/** Minimal Tiptap node renderer */
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
      <p className="mb-3 leading-relaxed">
        {(node.content ?? []).map((child: any, i: number) => (
          <TiptapNodeRender key={i} node={child} />
        ))}
      </p>
    );
  }

  if (node.type === "heading") {
    const level = node.attrs?.level ?? 2;
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return (
      <Tag className="font-bold mt-6 mb-3">
        {(node.content ?? []).map((child: any, i: number) => (
          <TiptapNodeRender key={i} node={child} />
        ))}
      </Tag>
    );
  }

  if (node.type === "horizontalRule") {
    return <hr className="border-zinc-700 my-6" />;
  }

  if (node.type === "hardBreak") {
    return <br />;
  }

  // Fallback for other node types
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

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Borrador",
    review: "En Revisión",
    approved: "Aprobado",
    active: "Activo",
  };
  return map[status] ?? status;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("es-CL");
  } catch {
    return date;
  }
}
