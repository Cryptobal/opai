"use client";

import { useState, type ReactNode } from "react";
import { Eye, ExternalLink, FileText, Loader2, Maximize2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const CPQ_PDF_TEMPLATE_OPTIONS = [
  { slug: "standard", label: "Estándar" },
  { slug: "detailed", label: "Detallado" },
  { slug: "tender", label: "Licitación" },
] as const;

export type CpqPdfTemplateSlug = (typeof CPQ_PDF_TEMPLATE_OPTIONS)[number]["slug"];
export type CpqPdfPreviewMode = "cotizacion" | "presentacion";

interface CpqPdfPreviewPanelProps {
  mode: CpqPdfPreviewMode;
  templateSlug: string;
  previewUrl: string | null;
  loading: boolean;
  onModeChange: (mode: CpqPdfPreviewMode) => void;
  onTemplateSlugChange: (slug: CpqPdfTemplateSlug) => void;
  /** Genera (o regenera) el PDF. Puede devolver la URL para abrirla al instante. */
  onGenerate: () => void | Promise<void | string | null>;
  title?: string;
  description?: string;
  className?: string;
  previewClassName?: string;
  emptyCotizacionText?: string;
  emptyPresentacionText?: string;
  footer?: ReactNode;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function CpqPdfPreviewPanel({
  mode,
  templateSlug,
  previewUrl,
  loading,
  onModeChange,
  onTemplateSlugChange,
  onGenerate,
  title = "PDF y documentos",
  description = "Genera la propuesta y adjunta respaldos para enviarla.",
  className,
  previewClassName,
  emptyCotizacionText = "Click en Generar PDF para ver la vista previa de la cotización",
  emptyPresentacionText = "Click en Generar PDF para ver la vista previa de la propuesta técnica",
  footer,
}: CpqPdfPreviewPanelProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const previewTitle =
    mode === "presentacion" ? "Preview presentación PDF" : "Preview cotización PDF";

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

  const busy = loading || viewLoading;

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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/60 bg-background/60 p-1">
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
          </div>
        </div>

        <div className="space-y-3 p-3">
          {mode === "cotizacion" && (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-2.5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                Formato de cotización
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {CPQ_PDF_TEMPLATE_OPTIONS.map((option) => (
                  <button
                    key={option.slug}
                    type="button"
                    onClick={() => onTemplateSlugChange(option.slug)}
                    className={cn(
                      "h-10 rounded-md border px-2 text-xs font-semibold transition-colors sm:h-8",
                      templateSlug === option.slug
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent bg-background/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {previewUrl ? (
            <>
              {/* Móvil/tablet: CTA de vista nativa (iframe PDF suele fallar en iOS). */}
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-background/45 px-4 py-6 text-center lg:hidden">
                <FileText className="h-10 w-10 text-status-info-fg" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Propuesta lista para ver
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Ábrela en el visor del dispositivo, sin descargar.
                  </p>
                </div>
                <Button
                  className="h-11 w-full max-w-xs gap-2"
                  disabled={busy}
                  onClick={() => openViewer(previewUrl)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver propuesta
                </Button>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs sm:h-8"
                    onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir
                  </Button>
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
