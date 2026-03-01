"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  ExternalLink,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type GlobalDoc = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  createdAt: string;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GlobalDocumentsClient() {
  const [documents, setDocuments] = useState<GlobalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/config/global-documents");
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data?.documents ?? json.data ?? []);
      }
    } catch {
      toast.error("Error al cargar documentos globales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleUpload = async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );
    if (pdfFiles.length === 0) {
      toast.error("Solo se permiten archivos PDF");
      return;
    }

    setUploading(true);
    try {
      for (const file of pdfFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/config/global-documents", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }
      toast.success(
        `${pdfFiles.length} documento${pdfFiles.length > 1 ? "s" : ""} subido${pdfFiles.length > 1 ? "s" : ""}`
      );
      await fetchDocs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al subir";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/config/global-documents/${docId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Documento eliminado");
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } else {
        toast.error("Error al eliminar documento");
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Documentos cargados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sube PDFs de documentos globales como OS10, manuales de seguridad u
            otros recursos compartidos entre instalaciones.
          </p>
        </div>
        <Badge variant="secondary">{documents.length} documentos</Badge>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/40"
        }`}
      >
        <input
          type="file"
          accept=".pdf"
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => {
            if (e.target.files) handleUpload(e.target.files);
            e.target.value = "";
          }}
          disabled={uploading}
        />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <FileUp className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {uploading
              ? "Subiendo..."
              : "Arrastra PDFs aquí o haz clic para seleccionar"}
          </p>
          <p className="text-xs text-muted-foreground">
            Solo archivos PDF, máximo 10 MB cada uno
          </p>
        </div>
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No hay documentos globales subidos aún
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                  <FileText className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>·</span>
                    <span>
                      {new Intl.DateTimeFormat("es-CL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(doc.createdAt))}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {doc.fileUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(doc.fileUrl, "_blank")}
                      title="Abrir documento"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                    onClick={() => setDeleteId(doc.id)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar documento"
        description="El documento será eliminado permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
      />
    </div>
  );
}
