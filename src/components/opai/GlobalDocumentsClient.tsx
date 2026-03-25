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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocStatusBadge } from "@/components/ops/DocStatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type TipoDoc = {
  id: string;
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  order: number;
};

type DocGlobal = {
  id: string;
  tipoId: string;
  tipo: TipoDoc;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  notes: string | null;
  portalClienteVisible: boolean;
  createdAt: string;
};

type TipoConDoc = {
  id: string;
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  order: number;
  documentoActual: { id: string; status: string; fileName: string; expiresAt: string | null } | null;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GlobalDocumentsClient() {
  const [tipos, setTipos] = useState<TipoConDoc[]>([]);
  const [documents, setDocuments] = useState<DocGlobal[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<{ tipoId: string; tipoNombre: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ issuedAt: "", expiresAt: "", notes: "" });

  const fetchData = useCallback(async () => {
    try {
      const [tiposRes, docsRes] = await Promise.all([
        fetch("/api/operacional/tipos?capa=global"),
        fetch("/api/operacional/documentos-globales"),
      ]);
      const [tiposJson, docsJson] = await Promise.all([tiposRes.json(), docsRes.json()]);
      if (tiposJson.success) setTipos(tiposJson.data);
      else console.error("[GlobalDocs] tipos error:", tiposJson);
      if (docsJson.success) setDocuments(docsJson.data);
      else console.error("[GlobalDocs] docs error:", docsJson);
    } catch (err) {
      console.error("[GlobalDocs] fetch error:", err);
      toast.error("Error al cargar documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = async () => {
    if (!uploadModal || !uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("tipoId", uploadModal.tipoId);
      if (uploadForm.issuedAt) formData.append("issuedAt", uploadForm.issuedAt);
      if (uploadForm.expiresAt) formData.append("expiresAt", uploadForm.expiresAt);
      if (uploadForm.notes) formData.append("notes", uploadForm.notes);

      const res = await fetch("/api/operacional/documentos-globales", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      toast.success("Documento subido");
      setUploadModal(null);
      setUploadFile(null);
      setUploadForm({ issuedAt: "", expiresAt: "", notes: "" });
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/operacional/documentos-globales/${docId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Documento eliminado");
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } else {
        toast.error("Error al eliminar");
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

  // Score
  const obligatorios = tipos.filter((t) => t.obligatorio);
  const vigentes = obligatorios.filter((t) => {
    const doc = documents.find((d) => d.tipoId === t.id);
    return doc && (doc.status === "vigente" || doc.status === "no_aplica");
  }).length;
  const porVencer = documents.filter((d) => d.status === "por_vencer").length;
  const vencidos = documents.filter((d) => d.status === "vencido").length;

  return (
    <div className="space-y-4">
      {/* Score */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">
                Cumplimiento: {vigentes}/{obligatorios.length} documentos vigentes
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {porVencer > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {porVencer} por vencer
                  </span>
                )}
                {vencidos > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="h-3 w-3" /> {vencidos} vencido{vencidos > 1 ? "s" : ""}
                  </span>
                )}
                {obligatorios.length - vigentes - porVencer - vencidos > 0 && (
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Circle className="h-3 w-3" /> {obligatorios.length - vigentes - porVencer - vencidos} sin documento
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {obligatorios.length > 0 ? Math.round((vigentes / obligatorios.length) * 100) : 100}%
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${obligatorios.length > 0 ? (vigentes / obligatorios.length) * 100 : 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <div className="space-y-2">
        {tipos.map((tipo) => {
          const doc = documents.find((d) => d.tipoId === tipo.id);
          return (
            <Card key={tipo.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                {/* Status icon */}
                <div className="shrink-0">
                  {doc ? (
                    doc.status === "vigente" || doc.status === "no_aplica" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : doc.status === "por_vencer" ? (
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )
                  ) : (
                    <Circle className="h-5 w-5 text-zinc-600" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tipo.nombre}</p>
                    {!tipo.obligatorio && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Opcional</Badge>
                    )}
                  </div>
                  {tipo.normativa && (
                    <p className="text-xs text-muted-foreground truncate">{tipo.normativa}</p>
                  )}
                  {doc && (
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span className="truncate">{doc.fileName}</span>
                      <span>·</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.expiresAt && (
                        <>
                          <span>·</span>
                          <span>Vence: {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(new Date(doc.expiresAt))}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div className="shrink-0">
                  {doc ? (
                    <DocStatusBadge status={doc.status} expiresAt={doc.expiresAt} />
                  ) : (
                    <DocStatusBadge status="sin_documento" />
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {doc?.fileUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(doc.fileUrl, "_blank")}
                      title="Ver PDF"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {doc ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => setDeleteId(doc.id)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setUploadModal({ tipoId: tipo.id, tipoNombre: tipo.nombre });
                        setUploadFile(null);
                        setUploadForm({ issuedAt: "", expiresAt: "", notes: "" });
                      }}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Cargar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upload Modal */}
      <Dialog open={!!uploadModal} onOpenChange={(open) => !open && setUploadModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar documento: {uploadModal?.tipoNombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* File drop */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f?.type === "application/pdf") setUploadFile(f);
                else toast.error("Solo se permiten archivos PDF");
              }}
              className="relative rounded-lg border-2 border-dashed p-6 text-center border-border hover:border-muted-foreground/40 transition-colors"
            >
              <input
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setUploadFile(f);
                  e.target.value = "";
                }}
              />
              {uploadFile ? (
                <div className="flex items-center gap-2 justify-center">
                  <FileText className="h-5 w-5 text-red-400" />
                  <span className="text-sm font-medium truncate">{uploadFile.name}</span>
                  <Badge variant="secondary">{formatFileSize(uploadFile.size)}</Badge>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <FileUp className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm">Arrastra un PDF o haz clic</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha emisión</Label>
                <Input
                  type="date"
                  value={uploadForm.issuedAt}
                  onChange={(e) => setUploadForm((p) => ({ ...p, issuedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha vencimiento</Label>
                <Input
                  type="date"
                  value={uploadForm.expiresAt}
                  onChange={(e) => setUploadForm((p) => ({ ...p, expiresAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notas (opcional)</Label>
              <Input
                value={uploadForm.notes}
                onChange={(e) => setUploadForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModal(null)}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
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
