"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Send,
  Eye,
  Upload,
  Plus,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DOC_STATUS_CONFIG,
  type GuardEvent,
  type GuardEventDocument,
} from "@/lib/guard-events";

interface EventDocumentsProps {
  event: GuardEvent;
  onDocumentGenerated?: (doc: GuardEventDocument) => void;
}

/**
 * Sub-component for managing documents associated to a guard event.
 * Shows list of generated docs + actions (generate, preview, send, mark DT upload).
 */
export function EventDocuments({ event, onDocumentGenerated }: EventDocumentsProps) {
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);

  const docs = event.documents ?? [];

  async function handleGenerateDocument() {
    setGeneratingDoc(true);
    try {
      // TODO (Local phase): Show template picker, call generate-doc endpoint
      toast.info("Selección de template pendiente (fase local)");
    } catch {
      toast.error("Error al generar documento");
    } finally {
      setGeneratingDoc(false);
    }
  }

  async function handleSendDocument(doc: GuardEventDocument) {
    setSendingDocId(doc.id);
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/send-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.documentId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Documento enviado por correo");
    } catch {
      toast.error("Error al enviar documento");
    } finally {
      setSendingDocId(null);
    }
  }

  async function handleMarkUploadedDt(doc: GuardEventDocument) {
    // TODO (Local phase): PATCH event metadata with DT upload info
    toast.info("Marcar subido a DT (pendiente fase local)");
  }

  function handlePreview(doc: GuardEventDocument) {
    // TODO (Local phase): Open document preview in modal/new tab
    toast.info("Preview del documento (pendiente fase local)");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Documentos asociados</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerateDocument}
          disabled={generatingDoc}
          className="h-7 gap-1.5 text-xs"
        >
          {generatingDoc ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Generar documento
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-1.5 text-sm text-muted-foreground">
            No hay documentos generados para este evento.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Puedes generar cartas, certificados u otros documentos desde un template.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const statusCfg = DOC_STATUS_CONFIG[doc.status] ?? DOC_STATUS_CONFIG.generated;
            const isSending = sendingDocId === doc.id;

            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {doc.templateName && <span>{doc.templateName}</span>}
                    <span>{new Date(doc.createdAt).toLocaleDateString("es-CL")}</span>
                  </div>
                </div>
                <Badge variant={statusCfg.variant} className="shrink-0">
                  {statusCfg.label}
                </Badge>
                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Previsualizar"
                    onClick={() => handlePreview(doc)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Enviar por correo"
                    disabled={isSending}
                    onClick={() => handleSendDocument(doc)}
                  >
                    {isSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {doc.status !== "uploaded_dt" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Marcar subido a DT"
                      onClick={() => handleMarkUploadedDt(doc)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {doc.status === "uploaded_dt" && (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
