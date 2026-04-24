"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Loader2,
  FileText,
  Clock,
  Download,
  FileSignature,
  Building2,
  User,
  MapPin,
  Handshake,
  History,
  Trash2,
  ShieldCheck,
  ExternalLink,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/opai";
import { ContractEditor } from "./ContractEditor";
import { SignatureRequestModal } from "./SignatureRequestModal";
import { SendForReviewModal } from "./SendForReviewModal";
import { SignatureStatusPanel } from "./SignatureStatusPanel";
import { DOC_STATUS_CONFIG, DOC_CATEGORIES } from "@/lib/docs/token-registry";
import { toast } from "sonner";
import type { DocDocument, DocHistory } from "@/types/docs";
import { useCanDelete } from "@/lib/permissions-context";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
import { cn } from "@/lib/utils";

interface DocDetailClientProps {
  documentId: string;
}

/**
 * Limpia text nodes vacíos o inválidos que ProseMirror/Tiptap rechaza al
 * cargar. Los documentos viejos generados antes del fix del resolver pueden
 * tener nodos `{type:"text", text:""}` que rompen el editor entero.
 */
function sanitizeTiptapContent(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) return null;
    return node;
  }
  if (Array.isArray(node.content)) {
    const cleaned = node.content
      .map(sanitizeTiptapContent)
      .filter((n: any) => n != null);
    return { ...node, content: cleaned };
  }
  return node;
}

const ENTITY_ICONS: Record<string, React.ComponentType<any>> = {
  crm_account: Building2,
  crm_contact: User,
  crm_installation: MapPin,
  crm_deal: Handshake,
};

const ENTITY_LABELS: Record<string, string> = {
  crm_account: "Cuenta",
  crm_contact: "Contacto",
  crm_installation: "Instalación",
  crm_deal: "Negocio",
};

function getCategoryLabel(module: string, category: string): string {
  const cats = DOC_CATEGORIES[module];
  if (!cats) return category;
  return cats.find((c) => c.key === category)?.label || category;
}

export function DocDetailClient({ documentId }: DocDetailClientProps) {
  const router = useRouter();
  const canDeleteDocument = useCanDelete("docs", "gestion");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<DocDocument | null>(null);

  // Contexto de página para OPAI Intelligence (chat contextual tipo Notion)
  useRegisterChatPageContext(
    doc
      ? {
          entityType: "doc_document",
          entityId: doc.id,
          entityName: doc.title,
          entityUrl: `/docs/${doc.id}`,
          extra: doc.category ? `Categoría: ${doc.category} · Estado: ${doc.status}` : undefined,
        }
      : null,
  );
  const [content, setContent] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [activeSignatureRequest, setActiveSignatureRequest] = useState<any | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [contentHtml, setContentHtml] = useState<string | null>(null);
  const [contentHtmlLoading, setContentHtmlLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [resolvingSuggestion, setResolvingSuggestion] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ suggestionId: string } | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const fetchDocument = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/docs/documents/${documentId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setDoc(data.data);
        setContent(sanitizeTiptapContent(data.data.content));
        setStatus(data.data.status);
        setHistory(data.data.history || []);
      }
    } catch (error) {
      console.error("Error fetching document:", error);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const fetchSignatureRequest = useCallback(async () => {
    try {
      setSignatureLoading(true);
      const res = await fetch(`/api/docs/documents/${documentId}/signature-request`);
      const data = await res.json();
      if (data.success) {
        setActiveSignatureRequest(data.data?.active ?? null);
      }
    } catch (error) {
      console.error("Error fetching signature request:", error);
    } finally {
      setSignatureLoading(false);
    }
  }, [documentId]);

  const fetchSuggestions = useCallback(async () => {
    try {
      setSuggestionsLoading(true);
      const res = await fetch(`/api/docs/documents/${documentId}/suggestions`);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data ?? []);
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchDocument();
    fetchSignatureRequest();
    fetchSuggestions();
  }, [fetchDocument, fetchSignatureRequest, fetchSuggestions]);

  // Cargar vista HTML resuelta solo cuando el documento es read-only (firmado o
  // fuera de draft/review). En draft/review usamos el editor Tiptap directamente
  // para permitir edición. Contratos de servicio siguen el mismo flujo — los
  // tokens ya resueltos se rendean como text nodes nativos del editor.
  useEffect(() => {
    if (!doc || !documentId) return;
    const isReadOnly = !["draft", "review"].includes(doc.status);
    if (!isReadOnly) {
      setContentHtml(null);
      return;
    }
    let cancelled = false;
    setContentHtmlLoading(true);
    fetch(`/api/docs/documents/${documentId}/content-html`, { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((html) => {
        if (!cancelled) setContentHtml(html);
      })
      .catch(() => {
        if (!cancelled) setContentHtml(null);
      })
      .finally(() => {
        if (!cancelled) setContentHtmlLoading(false);
      });
    return () => { cancelled = true; };
  }, [doc, documentId]);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/docs/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          status: status !== doc.status ? status : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Documento guardado");
        setDoc(data.data);
      } else {
        toast.error(data.error || "Error al guardar");
      }
    } catch (error) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading("pdf");
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/export-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar PDF");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+)"?/);
      const fileName = match?.[1]?.replace(/^"?|"?$/g, "") || `documento-${documentId}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al descargar PDF");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadDocx = async () => {
    setDownloading("docx");
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/export-docx`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar Word");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+)"?/);
      const fileName = match?.[1]?.replace(/^"?|"?$/g, "") || `documento-${documentId}.docx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Word descargado");
    } catch (e: any) {
      toast.error(e?.message || "Error al descargar Word");
    } finally {
      setDownloading(null);
    }
  };

  const handleResolveSuggestion = async (suggestionId: string, action: "approve" | "reject", adminComment?: string) => {
    setResolvingSuggestion(suggestionId);
    try {
      const res = await fetch(`/api/docs/documents/${documentId}/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminComment }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(action === "approve" ? "Sugerencia aprobada" : "Sugerencia rechazada");
      fetchSuggestions();
      fetchDocument();
    } catch (e: any) {
      toast.error(e.message || "Error al resolver sugerencia");
    } finally {
      setResolvingSuggestion(null);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteDocument) {
      toast.error("No tienes permisos para eliminar este documento");
      return;
    }
    if (!confirm("¿Eliminar este documento permanentemente?")) return;
    try {
      await fetch(`/api/docs/documents/${documentId}`, { method: "DELETE" });
      toast.success("Documento eliminado");
      router.push("/opai/documentos");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-20">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Documento no encontrado</p>
      </div>
    );
  }

  const statusConfig = DOC_STATUS_CONFIG[doc.status];
  const isEditable = ["draft", "review"].includes(doc.status);
  const isSigned = !!(doc.signedAt || doc.signatureStatus === "completed");
  const pendingSuggestionsCount = suggestions.filter(
    (s: any) => s.status === "pending",
  ).length;

  return (
    <div className="space-y-4">
      {/* Header — mobile-first: status pill prominent, actions compact */}
      <PageHeader
        backHref="/opai/documentos"
        backLabel="Documentos"
        title={doc.title}
        description={
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider border",
                statusConfig?.color ?? "bg-muted text-muted-foreground border-border",
              )}
            >
              {statusConfig?.label ?? doc.status}
            </span>
            {pendingSuggestionsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-yellow-500/20 text-yellow-700 border border-yellow-500/40">
                {pendingSuggestionsCount} sugerencia(s) del cliente
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {doc.module.toUpperCase()} · {getCategoryLabel(doc.module, doc.category)}
              {doc.template ? ` · ${doc.template.name}` : ""}
            </span>
          </div>
        }
        actions={
          <>
            {isEditable && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={saving}
                aria-label="Guardar"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Guardar</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void handleDownloadPdf()}
              disabled={downloading !== null}
              aria-label="Descargar PDF"
            >
              {downloading === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">PDF</span>
            </Button>
            {!isSigned && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setReviewModalOpen(true)}
                  aria-label="Enviar a revisión"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Revisión</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setSignatureModalOpen(true)}
                  aria-label="Enviar a firma"
                >
                  <FileSignature className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Firma</span>
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowHistory(!showHistory)}
              aria-label="Historial"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Historial</span>
            </Button>
            {canDeleteDocument ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive"
                onClick={handleDelete}
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </>
        }
      />

      {/* Document info panel — compact on mobile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4 rounded-lg border border-border bg-card">
        {/* Status selector */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground">Estado</span>
          <Select
            value={status}
            onValueChange={setStatus}
            disabled={!isEditable && doc.status !== "approved"}
          >
            <SelectTrigger className="h-8 text-xs w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOC_STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {status !== doc.status && (
            <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
              Actualizar
            </Button>
          )}
        </div>

        {/* Dates */}
        {(doc.effectiveDate || doc.expirationDate) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {doc.effectiveDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Inicio: {new Date(doc.effectiveDate).toLocaleDateString("es-CL")}
              </span>
            )}
            {doc.expirationDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Vence: {new Date(doc.expirationDate).toLocaleDateString("es-CL")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Associations */}
      {doc.associations && doc.associations.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-xs text-muted-foreground">Asociado a:</span>
          {doc.associations.map((assoc) => {
            const Icon = ENTITY_ICONS[assoc.entityType] || FileText;
            const entityUrl = assoc.entityType === "crm_account" ? `/opai/crm/cuentas/${assoc.entityId}`
              : assoc.entityType === "crm_contact" ? `/opai/crm/contactos/${assoc.entityId}`
              : assoc.entityType === "crm_installation" ? `/opai/crm/instalaciones/${assoc.entityId}`
              : assoc.entityType === "crm_deal" ? `/opai/crm/negocios/${assoc.entityId}`
              : null;
            const label = assoc.entityName
              ? `${ENTITY_LABELS[assoc.entityType] || assoc.entityType}: ${assoc.entityName}`
              : ENTITY_LABELS[assoc.entityType] || assoc.entityType;
            return entityUrl ? (
              <a
                key={assoc.id}
                href={entityUrl}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs hover:bg-muted/80 hover:text-primary transition-colors"
              >
                <Icon className="h-3 w-3" />
                {label}
              </a>
            ) : (
              <span
                key={assoc.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs"
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
            );
          })}
        </div>
      )}

      {/* Contract client portal link — compact mobile */}
      {doc?.contractClientToken && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3 rounded-lg border border-teal-600/30 bg-teal-950/20">
          <FileSignature className="h-4 w-4 text-teal-400 shrink-0" />
          <span className="text-xs text-teal-300 font-medium shrink-0">
            Portal cliente
          </span>
          <code className="hidden md:inline text-xs text-teal-400 bg-teal-950/50 px-2 py-0.5 rounded select-all truncate max-w-[280px]">
            {typeof window !== "undefined"
              ? `${window.location.origin}/contrato/${doc.contractClientToken}`
              : `/contrato/${doc.contractClientToken}`}
          </code>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="text-xs text-teal-400 hover:text-teal-300 underline px-2 py-1"
              onClick={() => {
                const url = `${window.location.origin}/contrato/${doc.contractClientToken}`;
                navigator.clipboard.writeText(url);
                toast.success("Link copiado");
              }}
            >
              Copiar
            </button>
            <a
              href={`/contrato/${doc.contractClientToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-teal-400 hover:text-teal-300 underline px-2 py-1"
            >
              Abrir
            </a>
          </div>
        </div>
      )}

      {/* Signature panel */}
      {signatureLoading ? (
        <div className="text-xs text-muted-foreground">Cargando estado de firma...</div>
      ) : (
        <SignatureStatusPanel
          documentId={documentId}
          activeRequest={activeSignatureRequest}
          onRefresh={fetchSignatureRequest}
          isSigned={!!(doc?.signedAt || doc?.signatureStatus === "completed")}
        />
      )}

      {/* Registro de firma electrónica (cuando está completado) */}
      {doc?.signatureStatus === "completed" && doc?.signatureData && (doc.signatureData as { signers?: Array<{ name: string; email: string; signedAt?: string | null; method?: string | null }> }).signers?.length ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Registro de firma electrónica
          </h3>
          <p className="text-xs text-muted-foreground">
            Documento firmado conforme a la Ley 19.799. Validez verificable por fecha, firmantes y método de firma.
          </p>
          <ul className="space-y-2">
            {(doc.signatureData as { signers: Array<{ name: string; email: string; signedAt?: string | null; method?: string | null }> }).signers.map((s: any, i: number) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs py-1.5 border-b border-border last:border-0">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.email}</span>
                {s.signedAt ? (
                  <span className="text-muted-foreground">
                    · {new Date(s.signedAt).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                ) : null}
                {s.method ? <span className="text-muted-foreground">· {s.method}</span> : null}
              </li>
            ))}
          </ul>
          {doc.signedViewToken ? (
            <p className="text-xs text-muted-foreground pt-2">
              Enlace público para ver/descargar (sin login):{" "}
              <a
                href={`/signed/${documentId}/${doc.signedViewToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Ver documento firmado <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-muted/20">
          <h3 className="text-sm font-semibold mb-3">Historial de Cambios</h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 text-xs text-muted-foreground"
              >
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                <span className="font-medium">{h.action}</span>
                {h.details?.from && h.details?.to && (
                  <span>
                    {h.details.from} → {h.details.to}
                  </span>
                )}
                <span className="ml-auto">
                  {new Date(h.createdAt).toLocaleDateString("es-CL", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions panel (for service contracts) */}
      {suggestions.length > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-yellow-500" />
              Sugerencias del cliente
              {suggestions.filter((s: any) => s.status === "pending").length > 0 && (
                <span className="bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {suggestions.filter((s: any) => s.status === "pending").length}
                </span>
              )}
            </h3>
            <span className="text-xs text-muted-foreground">
              {suggestions.filter((s: any) => s.status === "pending").length} pendiente(s)
            </span>
          </div>
          <div className="space-y-3">
            {suggestions.map((s: any) => (
              <div
                key={s.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  s.status === "pending" ? "border-yellow-600/50 bg-yellow-950/20" :
                  s.status === "approved" ? "border-green-600/30 bg-green-950/10" :
                  "border-red-600/30 bg-red-950/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Cláusula {s.clauseNumber}: {s.clauseTitle}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    s.status === "pending" ? "bg-yellow-600/20 text-yellow-400" :
                    s.status === "approved" ? "bg-green-600/20 text-green-400" :
                    "bg-red-600/20 text-red-400"
                  }`}>
                    {s.status === "pending" ? "Pendiente" : s.status === "approved" ? "Aprobada" : "Rechazada"}
                  </span>
                </div>
                {/* Diff view */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block mb-1">Original:</span>
                    <div className="bg-red-950/30 border border-red-900/30 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {s.originalContent}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Propuesto:</span>
                    <div className="bg-green-950/30 border border-green-900/30 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {s.suggestedContent}
                    </div>
                  </div>
                </div>
                {s.clientNote && (
                  <p className="text-xs text-muted-foreground italic">Nota del cliente: {s.clientNote}</p>
                )}
                {s.adminComment && (
                  <p className="text-xs text-muted-foreground">Comentario admin: {s.adminComment}</p>
                )}
                {s.status === "pending" && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleResolveSuggestion(s.id, "approve")}
                      disabled={resolvingSuggestion === s.id}
                      className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => {
                        setRejectModal({ suggestionId: s.id });
                        setRejectComment("");
                      }}
                      disabled={resolvingSuggestion === s.id}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor o contenido resuelto */}
      {contentHtmlLoading ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden min-h-[300px] flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contentHtml ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div
            className="prose prose-invert prose-sm max-w-none p-6 text-foreground [&_p]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground [&_td]:text-foreground [&_th]:text-foreground"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>
      ) : (
        <ContractEditor content={content} onChange={setContent} editable={isEditable} />
      )}

      {/* Reject suggestion modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-5 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-sm font-semibold">Rechazar sugerencia</h3>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Comentario para el cliente (opcional)</label>
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Explique por qué se rechaza esta sugerencia..."
                className="w-full h-24 bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejectModal(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  handleResolveSuggestion(rejectModal.suggestionId, "reject", rejectComment || undefined);
                  setRejectModal(null);
                }}
                disabled={!!resolvingSuggestion}
              >
                Rechazar
              </Button>
            </div>
          </div>
        </div>
      )}

      <SignatureRequestModal
        open={signatureModalOpen}
        onOpenChange={setSignatureModalOpen}
        documentId={documentId}
        onCreated={() => {
          void fetchSignatureRequest();
          fetchDocument();
        }}
      />

      <SendForReviewModal
        open={reviewModalOpen}
        onOpenChange={setReviewModalOpen}
        documentId={documentId}
        associations={doc.associations}
        onSent={() => fetchDocument()}
      />
    </div>
  );
}
