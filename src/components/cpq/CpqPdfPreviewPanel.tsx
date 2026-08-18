"use client";

import { useState, type ReactNode } from "react";
import {
  Download,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
  Share2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadOrShareFile } from "@/lib/files/download-or-share";

export const CPQ_PDF_TEMPLATE_OPTIONS = [
  { slug: "standard", label: "Cotización PDF · formato único" },
] as const;

/** Slugs que el endpoint aún acepta (documentos históricos). La UI solo emite `standard`. */
export type CpqPdfTemplateSlug = "standard" | "detailed" | "tender";
export type CpqPdfPreviewMode = "cotizacion" | "presentacion";

interface CpqPdfPreviewPanelProps {
  mode: CpqPdfPreviewMode;
  templateSlug: string;
  previewUrl: string | null;
  loading: boolean;
  onModeChange: (mode: CpqPdfPreviewMode) => void;
  onTemplateSlugChange?: (slug: CpqPdfTemplateSlug) => void;
  /** Genera (o regenera) el PDF. Puede devolver la URL para abrirla al instante. */
  onGenerate: () => void | Promise<void | string | null>;
  title?: string;
  description?: string;
  className?: string;
  previewClassName?: string;
  emptyCotizacionText?: string;
  emptyPresentacionText?: string;
  footer?: ReactNode;
  /** Si se omite, se muestran ambos modos. */
  allowedModes?: CpqPdfPreviewMode[];
  /** Nombre de archivo sugerido al descargar / compartir. */
  downloadFilename?: string;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function defaultFilename(mode: CpqPdfPreviewMode): string {
  return mode === "presentacion"
    ? "propuesta-tecnica.pdf"
    : "cotizacion.pdf";
}

export function CpqPdfPreviewPanel({
  mode,
  templateSlug,
  previewUrl,
  loading,
  onModeChange,
  onTemplateSlugChange,
  onGenerate,
  title = "Cotización PDF",
  description = "Formato único. Genera el PDF económico y ábrelo para revisar o enviar.",
  className,
  previewClassName,
  emptyCotizacionText = "Click en Generar PDF para ver la vista previa de la cotización",
  emptyPresentacionText = "Click en Generar PDF para ver la vista previa de la propuesta técnica",
  footer,
  allowedModes,
  downloadFilename,
}: CpqPdfPreviewPanelProps) {
  const modes = allowedModes && allowedModes.length > 0 ? allowedModes : (["cotizacion", "presentacion"] as CpqPdfPreviewMode[]);
  const showModeToggle = modes.length > 1;
  const [fullscreen, setFullscreen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  const previewTitle =
    mode === "presentacion" ? "Preview presentación PDF" : "Preview cotización PDF";
  const filename = downloadFilename || defaultFilename(mode);

  const openViewer = (url: string) => {
    // En iPad/iPhone el iframe PDF suele fallar o forzar descarga; el visor nativo
    // (pestaña nueva) es la forma fiable de ver sin bajar el archivo.
    if (isCoarsePointer()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setFullscreen(true);
  };

  const handleView = async () => {
    setViewLoading(true);
    try {
      let url = previewUrl;
      if (!url) {
        const generated = await onGenerate();
        if (typeof generated === "string" && generated) url = generated;
      }
      if (url) openViewer(url);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDownloadOrShare = async () => {
    setShareLoading(true);
    try {
      let url = previewUrl;
      if (!url) {
        const generated = await onGenerate();
        if (typeof generated === "string" && generated) url = generated;
      }
      if (!url) {
        toast.error("No se pudo generar el PDF");
        return;
      }
      const result = await downloadOrShareFile({
        url,
        filename,
        mimeType: "application/pdf",
      });
      if (result.method === "download") {
        toast.success("PDF listo para compartir");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al descargar el PDF");
    } finally {
      setShareLoading(false);
    }
  };

  const busy = loading || viewLoading || shareLoading;

  return (
    <>
      <Card className={cn("overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm", className)}>
        <div className="space-y-3 border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-muted/25 to-background p-3">
          {/* Título y acciones en columna: en el rail (~340px) el flex horizontal
              aplastaba el texto a 1 carácter de ancho (se leía hacia abajo). */}
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {title}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-foreground/90 break-words">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-1.5 border-primary/30 bg-background/70 px-3 text-xs font-semibold text-primary hover:bg-primary/10 sm:h-9"
                disabled={busy}
                onClick={() => void onGenerate()}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Generar PDF
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-10 gap-1.5 px-3 text-xs font-semibold sm:h-9"
                disabled={busy}
                onClick={() => void handleView()}
                title={previewUrl ? "Ver propuesta sin descargar" : "Generar y ver propuesta"}
              >
                {viewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Ver
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-1.5 px-3 text-xs font-semibold sm:h-9"
                disabled={busy}
                onClick={() => void handleDownloadOrShare()}
                title="Descargar o compartir por WhatsApp / Apps"
              >
                {shareLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5 lg:hidden" />
                )}
                {!shareLoading ? <Download className="hidden h-3.5 w-3.5 lg:inline" /> : null}
                <span className="lg:hidden">Compartir</span>
                <span className="hidden lg:inline">Descargar</span>
              </Button>
            </div>
          </div>

          {showModeToggle ? (
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-background/60 p-1">
            {modes.includes("cotizacion") ? (
            <button
              type="button"
              onClick={() => onModeChange("cotizacion")}
              className={cn(
                "h-10 rounded-md border px-2 text-xs font-semibold transition-colors sm:h-9",
                mode === "cotizacion"
                  ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              Cotización
            </button>
            ) : null}
            {modes.includes("presentacion") ? (
            <button
              type="button"
              onClick={() => onModeChange("presentacion")}
              className={cn(
                "h-10 rounded-md border px-2 text-xs font-semibold transition-colors sm:h-9",
                mode === "presentacion"
                  ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              Propuesta técnica
            </button>
            ) : null}
          </div>
          ) : null}
        </div>

        <div className="space-y-3 p-3">
          {mode === "cotizacion" && (
            <p className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 px-2.5 py-2 text-[12px] text-ds-text-3">
              Cotización PDF · formato único
            </p>
          )}

          {previewUrl ? (
            <>
              {/* Móvil/tablet: CTAs nativos (iframe PDF suele fallar en iOS). */}
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-background/45 px-4 py-6 text-center lg:hidden">
                <FileText className="h-10 w-10 text-status-info-fg" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Propuesta lista
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Ábrela en el visor o compártela por WhatsApp.
                  </p>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <Button
                    className="h-11 w-full gap-2"
                    disabled={busy}
                    onClick={() => openViewer(previewUrl)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver propuesta
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full gap-2"
                    disabled={busy}
                    onClick={() => void handleDownloadOrShare()}
                  >
                    {shareLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                    Descargar / Compartir
                  </Button>
                </div>
              </div>

              {/* Desktop: preview embebida + abrir a pantalla completa */}
              <div className="relative hidden lg:block">
                <iframe
                  src={previewUrl}
                  className={cn("h-[280px] w-full rounded-lg border border-border/60 bg-white", previewClassName)}
                  title={previewTitle}
                />
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  className="absolute right-2 top-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 text-[12px] font-semibold text-status-info-fg shadow-sm backdrop-blur-sm hover:bg-background"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Pantalla completa
                </button>
              </div>
            </>
          ) : (
            <div className={cn("flex h-28 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/45 px-4 text-center text-sm leading-relaxed text-muted-foreground", previewClassName)}>
              <span>{mode === "presentacion" ? emptyPresentacionText : emptyCotizacionText}</span>
            </div>
          )}

          {footer}
        </div>
      </Card>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-h-[100dvh] !w-screen !max-w-none !rounded-none !border-0 !p-0 bg-background [&>button]:hidden sm:!inset-3 sm:!max-h-none sm:!w-auto sm:!rounded-lg sm:!border">
          <DialogTitle className="sr-only">Vista previa de la propuesta</DialogTitle>
          <DialogDescription className="sr-only">
            PDF de la propuesta a pantalla completa
          </DialogDescription>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
              <span className="text-[12px] font-semibold text-muted-foreground">
                Vista previa · {mode === "presentacion" ? "Propuesta técnica" : "Cotización"}
              </span>
              <div className="flex items-center gap-1.5">
                {previewUrl ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs sm:h-8"
                      disabled={busy}
                      onClick={() => void handleDownloadOrShare()}
                    >
                      {shareLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Descargar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs sm:h-8"
                      onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 sm:h-8 sm:w-8"
                  aria-label="Cerrar vista previa"
                  onClick={() => setFullscreen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={previewTitle}
                  className="h-full w-full border-0 bg-white"
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
