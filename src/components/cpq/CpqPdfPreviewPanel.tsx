"use client";

import type { ReactNode } from "react";
import { FileText, RefreshCw, Loader2 } from "lucide-react";
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

interface CpqPdfPreviewPanelProps {
  mode: CpqPdfPreviewMode;
  templateSlug: string;
  previewUrl: string | null;
  loading: boolean;
  onModeChange: (mode: CpqPdfPreviewMode) => void;
  onTemplateSlugChange: (slug: CpqPdfTemplateSlug) => void;
  onGenerate: () => void | Promise<void>;
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
  emptyPresentacionText = "Click en Generar PDF para ver la presentación técnica",
  footer,
}: CpqPdfPreviewPanelProps) {
  return (
    <Card className={cn("overflow-hidden rounded-xl border-border/70 bg-card/85 shadow-sm", className)}>
      <div className="space-y-3 border-b border-border/50 bg-gradient-to-br from-primary/[0.10] via-muted/25 to-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-foreground/90">
                {description}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 border-primary/30 bg-background/70 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
            disabled={loading}
            onClick={onGenerate}
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
              "h-9 rounded-md border px-2 text-xs font-semibold transition-colors",
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
              "h-9 rounded-md border px-2 text-xs font-semibold transition-colors",
              mode === "presentacion"
                ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                : "border-transparent text-muted-foreground hover:bg-muted"
            )}
          >
            Presentación
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {mode === "cotizacion" && (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Formato de cotización
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {CPQ_PDF_TEMPLATE_OPTIONS.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  onClick={() => onTemplateSlugChange(option.slug)}
                  className={cn(
                    "h-8 rounded-md border px-2 text-xs font-semibold transition-colors",
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
          <iframe
            src={previewUrl}
            className={cn("h-[280px] w-full rounded-lg border border-border/60 bg-white", previewClassName)}
            title={mode === "presentacion" ? "Preview presentación PDF" : "Preview cotización PDF"}
          />
        ) : (
          <div className={cn("flex h-28 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/45 px-4 text-center text-sm leading-relaxed text-muted-foreground", previewClassName)}>
            <span>{mode === "presentacion" ? emptyPresentacionText : emptyCotizacionText}</span>
          </div>
        )}

        {footer}
      </div>
    </Card>
  );
}
