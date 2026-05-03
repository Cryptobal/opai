"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Send,
  Download,
  Plus,
  Loader2,
  Mail,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOC_STATUS_CONFIG,
  type GuardEvent,
  type GuardEventDocument,
} from "@/lib/guard-events";

interface EventDocumentsProps {
  event: GuardEvent;
  onDocumentGenerated?: (doc: GuardEventDocument) => void;
}

interface TemplateOption {
  id: string;
  name: string;
  category: string;
}

export function EventDocuments({ event, onDocumentGenerated }: EventDocumentsProps) {
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const [docs, setDocs] = useState<GuardEventDocument[]>(event.documents ?? []);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Send email modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendingDoc, setSendingDoc] = useState<GuardEventDocument | null>(null);
  const [ccEmail, setCcEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}`);
      const data = await res.json();
      if (data.success && data.data?.documents?.length > 0) {
        setDocs(data.data.documents);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setLoadingDocs(false);
    }
  }, [event.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const found = await fetchDocs();
      if (!found && !cancelled) {
        // Retry once after 2s (docs may still be generating on the server)
        setTimeout(async () => {
          if (!cancelled) await fetchDocs();
        }, 2000);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [event.id, fetchDocs]);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/docs/templates?module=payroll");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTemplates(data.data.map((t: any) => ({
          id: t.id,
          name: t.name,
          category: t.category ?? "",
        })));
      }
    } catch {
      toast.error("Error al cargar plantillas");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (showTemplatePicker && templates.length === 0) {
      fetchTemplates();
    }
  }, [showTemplatePicker, templates.length, fetchTemplates]);

  async function handleGenerateDocument() {
    if (!selectedTemplateId) {
      toast.error("Selecciona una plantilla primero");
      return;
    }
    setGeneratingDoc(true);
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/generate-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Documento generado correctamente");
      setShowTemplatePicker(false);
      setSelectedTemplateId("");
      const newDoc: GuardEventDocument = {
        id: data.data.documentId,
        documentId: data.data.documentId,
        title: data.data.title,
        status: "generated",
        templateName: templates.find((t) => t.id === selectedTemplateId)?.name,
        createdAt: data.data.createdAt ?? new Date().toISOString(),
      };
      setDocs((prev) => [...prev, newDoc]);
      if (onDocumentGenerated) onDocumentGenerated(newDoc);
    } catch {
      toast.error("Error al generar documento");
    } finally {
      setGeneratingDoc(false);
    }
  }

  function openSendModal(doc: GuardEventDocument) {
    setSendingDoc(doc);
    setCcEmail("");
    setSendModalOpen(true);
  }

  async function handleSendEmail() {
    if (!sendingDoc) return;
    setSending(true);
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/send-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: sendingDoc.documentId,
          ccEmails: ccEmail ? ccEmail.split(",").map((e) => e.trim()).filter(Boolean) : [],
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Documento enviado por correo al guardia");
      setSendModalOpen(false);
      setDocs((prev) =>
        prev.map((d) => d.id === sendingDoc.id ? { ...d, status: "sent" as const } : d)
      );
    } catch {
      toast.error("Error al enviar documento");
    } finally {
      setSending(false);
    }
  }

  async function handleDownloadPdf(doc: GuardEventDocument) {
    setDownloadingId(doc.id);
    try {
      const res = await fetch(`/api/ops/guard-events/${event.id}/send-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.documentId, downloadOnly: true }),
      });

      if (!res.ok) {
        toast.info("Descarga de PDF pendiente — abre el documento en Gestión Documental");
        window.open(`/opai/documentos/${doc.documentId}`, "_blank");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(`/opai/documentos/${doc.documentId}`, "_blank");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Documentos asociados</h4>
        {!showTemplatePicker && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTemplatePicker(true)}
            className="h-7 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Generar documento
          </Button>
        )}
      </div>

      {/* Template picker */}
      {showTemplatePicker && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium">Seleccionar plantilla</p>
          {loadingTemplates ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando plantillas...
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No hay plantillas disponibles.
            </p>
          ) : (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Seleccionar plantilla..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleGenerateDocument}
              disabled={!selectedTemplateId || generatingDoc}
              className="h-7 gap-1.5 text-xs"
            >
              {generatingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Generar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowTemplatePicker(false); setSelectedTemplateId(""); }}
              className="h-7 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Documents list */}
      {loadingDocs ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando documentos...
        </div>
      ) : docs.length === 0 && !showTemplatePicker ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-1.5 text-sm text-muted-foreground">
            No hay documentos generados para este evento.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const statusCfg = DOC_STATUS_CONFIG[doc.status] ?? DOC_STATUS_CONFIG.generated;
            const isDownloading = downloadingId === doc.id;

            return (
              <div
                key={doc.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-border bg-card p-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="min-w-0 w-full sm:flex-1 sm:w-auto">
                  <p className="break-words text-sm font-medium">{doc.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {doc.templateName && <span>{doc.templateName}</span>}
                    <span>{new Date(doc.createdAt).toLocaleDateString("es-CL")}</span>
                  </div>
                </div>
                <Badge variant={statusCfg.variant} className="shrink-0 text-[10px]">
                  {statusCfg.label}
                </Badge>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Descargar / Ver documento"
                    disabled={isDownloading}
                    onClick={() => handleDownloadPdf(doc)}
                  >
                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Enviar por correo al guardia"
                    onClick={() => openSendModal(doc)}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Send Email Modal */}
      <DialogPrimitive.Root open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed z-50 grid w-full max-w-md gap-4 border border-border bg-card p-6 shadow-xl duration-200",
              "inset-x-0 bottom-0 rounded-t-2xl",
              "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
              "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
              "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-base font-semibold">
                  Enviar documento por correo
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  Se enviará &quot;{sendingDoc?.title}&quot; como PDF adjunto al email del guardia.
                </DialogPrimitive.Description>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">CC (opcional, separar por comas)</Label>
                <Input
                  type="text"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="rrhh@empresa.cl, supervisor@empresa.cl"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" disabled={sending}>Cancelar</Button>
              </DialogPrimitive.Close>
              <Button onClick={handleSendEmail} disabled={sending} className="gap-1.5">
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Enviando..." : "Enviar correo"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
