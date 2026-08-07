"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const CPQ_PDF_TEMPLATE_OPTIONS = [
  { slug: "standard", label: "Estándar" },
  { slug: "detailed", label: "Detallado" },
  { slug: "tender", label: "Licitación" },
] as const;

export type CpqPdfTemplateSlug = (typeof CPQ_PDF_TEMPLATE_OPTIONS)[number]["slug"];
export type CpqPdfPreviewMode = "cotizacion" | "presentacion";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;

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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);

  const previewTitle =
    mode === "presentacion" ? "Preview presentación PDF" : "Preview cotización PDF";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!viewerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [viewerOpen]);

  const openViewer = (url: string) => {
    setViewerUrl(url);
    setZoom(1);
    setViewerOpen(true);
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
  const activeUrl = previewUrl;
  const dialogUrl = viewerUrl || previewUrl;

  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(1))));
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(1))));

  const viewer =
    mounted && viewerOpen && dialogUrl
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-background"
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa de la propuesta"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
              <span className="text-[12px] font-semibold text-muted-foreground">
                Vista previa · {mode === "presentacion" ? "Propuesta técnica" : "Cotización"}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center rounded-md border border-border/60 bg-background/70 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 sm:h-8 sm:w-8"
                    aria-label="Achicar"
                    title="Achicar"
                    disabled={zoom <= ZOOM_MIN}
                    onClick={zoomOut}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[3.25rem] text-center text-[12px] font-semibold tabular-nums text-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 sm:h-8 sm:w-8"
                    aria-label="Agrandar"
                    title="Agrandar"
                    disabled={zoom >= ZOOM_MAX}
                    onClick={zoomIn}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs sm:h-8"
                  onClick={() => window.open(dialogUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 sm:h-8 sm:w-8"
                  aria-label="Cerrar vista previa"
                  onClick={() => setViewerOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-ds-surface-2">
              <div
                className="origin-top-left transition-transform duration-150"
                style={{
                  width: `${100 * zoom}%`,
                  height: `${100 * zoom}%`,
                  minHeight: "100%",
                }}
              >
                <iframe
                  src={dialogUrl}
                  title={previewTitle}
                  className="h-full min-h-[100dvh] w-full border-0 bg-white"
                  style={{
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    minHeight: `calc(100dvh / ${zoom})`,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Card className={cn("overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm", className)}>
        <div className="space-y-3 border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-muted/25 to-background p-3">
          {/* Título y acciones en filas separadas: evita que "PDF y documentos"
              se aplaste letra a letra en el aside estrecho (340px / iPad). */}
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ds-text-2">
                {description}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="default"
              size="sm"
              className="h-10 w-full gap-1.5 px-2 text-xs font-semibold sm:h-9"
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
              className="h-10 w-full gap-1.5 border-primary/30 bg-background/70 px-2 text-xs font-semibold text-primary hover:bg-primary/10 sm:h-9"
              disabled={busy}
              onClick={() => void onGenerate()}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Generar PDF
            </Button>
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

          {activeUrl ? (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-lg border border-border/60 bg-white">
                <iframe
                  src={activeUrl}
                  className={cn("h-[220px] w-full bg-white sm:h-[280px]", previewClassName)}
                  title={previewTitle}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-2 text-xs font-semibold sm:h-9"
                disabled={busy}
                onClick={() => openViewer(activeUrl)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Ver pantalla completa
              </Button>
            </div>
          ) : (
            <div className={cn("flex h-28 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/45 px-4 text-center text-sm leading-relaxed text-muted-foreground", previewClassName)}>
              <span>{mode === "presentacion" ? emptyPresentacionText : emptyCotizacionText}</span>
            </div>
          )}

          {footer}
        </div>
      </Card>

      {viewer}
    </>
  );
}
