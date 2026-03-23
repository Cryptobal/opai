"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Paperclip, Loader2, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  publicUrl: string | null;
  createdAt: string;
};

interface QuoteAttachmentsSectionProps {
  quoteId: string;
  isLocked?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QuoteAttachmentsSection({ quoteId, isLocked }: QuoteAttachmentsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAttachments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/attachments`);
      const json = await res.json();
      if (json.success && json.data) {
        setAttachments(json.data);
      }
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [quoteId]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || uploading || isLocked) return;
      setUploading(true);
      try {
        let uploaded = 0;
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch(`/api/cpq/quotes/${quoteId}/attachments`, {
            method: "POST",
            body: formData,
          });
          const json = await res.json();
          if (json.success && json.data) {
            setAttachments((prev) => [...prev, json.data]);
            uploaded += 1;
          } else {
            toast.error(json.error || `Error al subir "${file.name}"`);
          }
        }
        if (uploaded > 0) {
          toast.success(uploaded === 1 ? "Archivo subido" : `${uploaded} archivos subidos`);
        }
      } catch {
        toast.error("Error al subir archivo");
      } finally {
        setUploading(false);
      }
    },
    [quoteId, uploading, isLocked]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const handleDelete = async (attachmentId: string) => {
    if (isLocked) return;
    setDeletingId(attachmentId);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } else {
        throw new Error(json.error);
      }
    } catch {
      setDeletingId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="shadow-sm overflow-hidden mt-3" inert={isLocked ? true : undefined}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold shrink-0">Para adjuntar documentos</h2>
          {!expanded && attachments.length > 0 && (
            <span className="text-[11px] text-muted-foreground truncate">
              {attachments.length} documento{attachments.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Los documentos subidos aquí se enviarán como adjuntos al enviar la cotización por correo.
          </p>
          {!isLocked && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              className={cn(
                "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
            >
              <input
                type="file"
                multiple
                className="hidden"
                id={`quote-attachments-${quoteId}`}
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <label
                htmlFor={`quote-attachments-${quoteId}`}
                className={cn(
                  "flex flex-col items-center gap-2",
                  uploading ? "pointer-events-none opacity-80" : "cursor-pointer"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <Paperclip className="h-8 w-8 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {uploading ? "Subiendo…" : "Arrastra archivos aquí o haz clic para seleccionar"}
                </span>
              </label>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Ningún documento adjunto.</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 truncate">
                      <span className="font-medium truncate block">{a.fileName}</span>
                      <span className="text-[10px] text-muted-foreground">{formatSize(a.size)}</span>
                    </div>
                    {a.publicUrl && (
                      <a
                        href={a.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Ver
                      </a>
                    )}
                  </div>
                  {!isLocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
