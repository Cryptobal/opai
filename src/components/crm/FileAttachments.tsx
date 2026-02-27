"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileListSkeleton } from "@/components/ui/skeleton";

export type FileAttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  publicUrl: string | null;
};

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentsProps {
  entityType: "lead" | "deal" | "account" | "contact" | "installation";
  entityId: string;
  /** Si true, no se muestra el área de subida (solo lista) */
  readOnly?: boolean;
  /** Título de la sección */
  title?: string;
  className?: string;
}

export function FileAttachments({
  entityType,
  entityId,
  readOnly = false,
  title = "Archivos",
  className,
}: FileAttachmentsProps) {
  const [files, setFiles] = useState<FileAttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/files?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      );
      const data = await res.json();
      if (data.success) setFiles(data.data);
    } catch {
      toast.error("Error al cargar archivos");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || uploading) return;
      setUploading(true);
      try {
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const form = new FormData();
          form.append("file", file);
          form.append("entityType", entityType);
          form.append("entityId", entityId);
          const res = await fetch("/api/crm/files/upload", {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!data.success) {
            toast.error(data.error || "Error al subir archivo");
            continue;
          }
          setFiles((prev) => [
            {
              id: data.data.id,
              fileName: data.data.fileName,
              mimeType: data.data.mimeType,
              size: data.data.size,
              createdAt: data.data.createdAt,
              publicUrl: data.data.publicUrl ?? null,
            },
            ...prev,
          ]);
        }
        if (fileList.length > 0) toast.success("Archivo(s) subido(s)");
      } catch {
        toast.error("Error al subir archivo");
      } finally {
        setUploading(false);
      }
    },
    [entityType, entityId, uploading]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/crm/files/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Error al eliminar");
          return;
        }
        setFiles((prev) => prev.filter((f) => f.id !== id));
        toast.success("Archivo eliminado");
      } catch {
        toast.error("Error al eliminar archivo");
      } finally {
        setDeleteId(null);
      }
    },
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          {title}
          {files.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">
              ({files.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <FileListSkeleton />
        ) : (
          <>
            {!readOnly && (
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={cn(
                  "mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  id={`file-attachments-${entityId}`}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
                <label
                  htmlFor={`file-attachments-${entityId}`}
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <Paperclip className="h-8 w-8 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {uploading
                      ? "Subiendo..."
                      : "Arrastra archivos aquí o haz clic para seleccionar"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF, imágenes, Word, Excel (máx. 10 MB)
                  </span>
                </label>
              </div>
            )}

            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No hay archivos adjuntos
              </p>
            ) : (
              <ul className="space-y-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  >
                    {IMAGE_MIMES.has(file.mimeType) && file.publicUrl ? (
                      <a
                        href={file.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 w-10 h-10 rounded overflow-hidden border bg-muted"
                      >
                        <img
                          src={file.publicUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="shrink-0 w-10 h-10 rounded flex items-center justify-center bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={file.fileName}>
                        {file.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(file.size)}
                        {" · "}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {file.publicUrl && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                          >
                            <a
                              href={file.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Ver archivo"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                          >
                            <a
                              href={`${file.publicUrl}?download=true`}
                              download={file.fileName}
                              title="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      {!readOnly && (
                        <>
                          <ConfirmDialog
                            open={deleteId === file.id}
                            onOpenChange={(open) =>
                              setDeleteId(open ? file.id : null)
                            }
                            title="Eliminar archivo"
                            description={`¿Eliminar "${file.fileName}"?`}
                            onConfirm={() => handleDelete(file.id)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Eliminar"
                            onClick={() => setDeleteId(file.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
