"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Paperclip, Loader2, Trash2, FileText } from "lucide-react";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLocked) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/cpq/quotes/${quoteId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.data) {
        setAttachments((prev) => [...prev, json.data]);
      } else {
        throw new Error(json.error || "Error al subir");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

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
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                <span className="ml-2">{uploading ? "Subiendo…" : "Agregar documento"}</span>
              </Button>
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
