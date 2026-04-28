"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  FileUp,
  Info,
  Loader2,
  Settings,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { categoriaForTipo } from "@/lib/docs-operacionales-categorias";

type ProtocolDoc = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  processed: boolean;
  createdAt: string;
};

/* Doc operacional global expuesto por /api/operacional/documentos-globales */
type DocOperacionalGlobal = {
  id: string;
  tipoId: string;
  tipo: {
    id: string;
    codigo: string;
    nombre: string;
    normativa: string | null;
    obligatorio: boolean;
    tieneVencimiento: boolean;
    diasAlerta: number;
    order: number;
  };
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  expiresAt: string | null;
  status: string;
  createdAt: string;
};

/* Documento legacy del modelo ProtocolDocument scope=global (queda visible para
 * que el usuario no pierda los PDFs subidos por el flujo viejo, pero ya no se
 * promueve esa ruta — el CTA principal lleva a Documentos Operacionales). */
type LegacyGlobalDoc = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  createdAt: string;
};

type Props = { installationId: string };

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ProtocolDocumentsSubTab({ installationId }: Props) {
  const [pdfRefDocs, setPdfRefDocs] = useState<ProtocolDoc[]>([]);
  const [opsGlobalDocs, setOpsGlobalDocs] = useState<DocOperacionalGlobal[]>([]);
  const [legacyDocs, setLegacyDocs] = useState<LegacyGlobalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchProtocolDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/installations/${installationId}/protocol`);
      const json = await res.json();
      if (json.success) {
        setPdfRefDocs(json.data.documents ?? []);
      }
    } catch {
      toast.error("Error al cargar documentos");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  const fetchGlobalDocs = useCallback(async () => {
    try {
      const [opsRes, legacyRes] = await Promise.all([
        fetch("/api/operacional/documentos-globales"),
        fetch("/api/config/global-documents"),
      ]);
      const opsJson = await opsRes.json().catch(() => null);
      const legacyJson = await legacyRes.json().catch(() => null);

      if (opsJson?.success) {
        setOpsGlobalDocs(opsJson.data ?? []);
      }
      if (legacyJson?.success) {
        const arr =
          legacyJson.data?.documents ?? legacyJson.data ?? [];
        setLegacyDocs(Array.isArray(arr) ? arr : []);
      }
    } catch {
      /* silencioso */
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProtocolDocs();
    void fetchGlobalDocs();
  }, [fetchProtocolDocs, fetchGlobalDocs]);

  /* Sólo nos interesan los globales de categoría "protocolos_seguridad" */
  const protocolGlobalDocs = opsGlobalDocs.filter(
    (d) =>
      categoriaForTipo({ codigo: d.tipo.codigo, nombre: d.tipo.nombre }) ===
      "protocolos_seguridad",
  );

  const handleUpload = async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf",
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

        const res = await fetch(
          `/api/installations/${installationId}/protocol/documents`,
          { method: "POST", body: formData },
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }
      toast.success(
        `${pdfFiles.length} PDF${pdfFiles.length > 1 ? "s" : ""} de referencia subido${pdfFiles.length > 1 ? "s" : ""}`,
      );
      await fetchProtocolDocs();
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
      const res = await fetch(
        `/api/installations/${installationId}/protocol/documents/${docId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Documento eliminado");
        setPdfRefDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  };

  if (loading && globalLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Documentos de Seguridad de la Empresa (centralizado en Doc Op) ── */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-tight text-foreground">
                Protocolos y Seguridad — Empresa
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Compartidos con todas las instalaciones.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/opai/configuracion/documentos-operacionales">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Gestionar en Documentos Operacionales
            </Link>
          </Button>
        </header>

        {globalLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : protocolGlobalDocs.length === 0 && legacyDocs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 px-6 text-center space-y-2">
              <Shield className="h-7 w-7 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-foreground">
                Aún no has cargado documentos de protocolos de seguridad.
              </p>
              <p className="text-xs text-muted-foreground">
                Súbelos desde Documentos Operacionales para que estén
                disponibles en todas las instalaciones.
              </p>
              <Button size="sm" className="mt-2" asChild>
                <Link href="/opai/configuracion/documentos-operacionales">
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Ir a Documentos Operacionales
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {protocolGlobalDocs.map((doc) => (
              <Card key={doc.id} className="bg-card/60 border-border/60">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.tipo.nombre}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="truncate">{doc.fileName}</span>
                      <span>·</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>·</span>
                      <span>
                        {dateFormatter.format(new Date(doc.createdAt))}
                      </span>
                      {doc.expiresAt && (
                        <>
                          <span>·</span>
                          <span>
                            Vence{" "}
                            {dateFormatter.format(new Date(doc.expiresAt))}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {doc.fileUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => window.open(doc.fileUrl, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Documentos legacy — ProtocolDocument scope=global */}
            {legacyDocs.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-amber-200/80">
                    Hay {legacyDocs.length}{" "}
                    {legacyDocs.length === 1
                      ? "documento subido"
                      : "documentos subidos"}{" "}
                    por el flujo anterior. Para mantener todo ordenado bajo
                    Documentos Operacionales, vuelve a subirlos desde ahí
                    cuando puedas.
                  </p>
                </div>
                <div className="space-y-1.5 pl-1">
                  {legacyDocs.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-background/40 px-3 py-2 text-xs"
                    >
                      <FileText className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                      <span className="truncate text-foreground">
                        {d.fileName}
                      </span>
                      <span className="ml-auto text-muted-foreground shrink-0">
                        {formatFileSize(d.fileSize)}
                      </span>
                      {d.fileUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => window.open(d.fileUrl, "_blank")}
                          aria-label="Abrir"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── PDFs de referencia para IA ── */}
      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-tight text-foreground">
                PDFs de referencia para IA
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Sólo se usan como contexto para el wizard{" "}
                <strong>Desde PDF</strong> en la pestaña Secciones.
              </p>
            </div>
          </div>
          <Badge variant="secondary">
            {pdfRefDocs.length}{" "}
            {pdfRefDocs.length === 1 ? "archivo" : "archivos"}
          </Badge>
        </header>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
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

        {/* Listado */}
        {pdfRefDocs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No hay PDFs de referencia aún
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pdfRefDocs.map((doc) => (
              <Card key={doc.id} className="bg-card/60 border-border/60">
                <CardContent className="flex items-center gap-3 py-3 px-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.fileName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>·</span>
                      <span>
                        {dateFormatter.format(new Date(doc.createdAt))}
                      </span>
                      {doc.processed && (
                        <>
                          <span>·</span>
                          <Badge
                            variant="success"
                            className="text-[10px] py-0"
                          >
                            Procesado
                          </Badge>
                        </>
                      )}
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

        <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Estos PDFs no son visibles para los clientes ni cuentan como
            documentos oficiales. Se usan únicamente como contexto para que la
            IA genere o complete las secciones del protocolo en{" "}
            <strong>Secciones → Desde PDF</strong>.
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Eliminar PDF de referencia"
        description="El archivo será eliminado permanentemente."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleteId) handleDelete(deleteId);
        }}
      />
    </div>
  );
}
