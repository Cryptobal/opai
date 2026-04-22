"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";

interface TemplatePreviewModalProps {
  quoteId: string;
  templateSlug: string;
  templateName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TemplatePreviewModal({
  quoteId,
  templateSlug,
  templateName,
  isOpen,
  onClose,
}: TemplatePreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevSlugRef = useRef<string>("");

  const fetchPdf = useCallback(
    async (slug: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/cpq/quotes/${quoteId}/export-pdf?templateSlug=${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Error ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!controller.signal.aborted) {
          // Revoke previous blob
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          setBlobUrl(url);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error generando PDF");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [quoteId, blobUrl],
  );

  useEffect(() => {
    if (isOpen && templateSlug && templateSlug !== prevSlugRef.current) {
      prevSlugRef.current = templateSlug;
      fetchPdf(templateSlug);
    }
  }, [isOpen, templateSlug, fetchPdf]);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      prevSlugRef.current = "";
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `cotizacion-${templateSlug}.pdf`;
    a.click();
  };

  const handleOpenFullScreen = () => {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "!fixed !inset-2 !bottom-2 !translate-x-0 !translate-y-0 !max-w-none !w-auto !max-h-none !rounded-lg",
          "sm:!inset-4 sm:!left-4 sm:!top-4 sm:!right-4 sm:!bottom-4",
          "flex flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{templateName}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista previa del PDF de cotización
          </DialogDescription>
        </DialogHeader>

        {/* PDF viewer */}
        <div className="flex-1 min-h-0 rounded-md border border-border bg-muted/30 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Generando PDF…</span>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center p-4">
                <FileText className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchPdf(templateSlug)}>
                  Reintentar
                </Button>
              </div>
            </div>
          )}
          {blobUrl && !error && (
            <>
              {/* Desktop: iframe with browser's native PDF viewer */}
              <iframe
                src={blobUrl}
                className="hidden sm:block w-full h-full border-0"
                title={`Preview ${templateName}`}
              />
              {/* Mobile: prompt to open in full screen */}
              <div className="sm:hidden flex flex-col items-center justify-center gap-4 p-6 h-full">
                <FileText className="h-12 w-12 text-teal-400" />
                <p className="text-sm text-foreground font-medium text-center">
                  PDF generado correctamente
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Abre en pantalla completa para ver todas las páginas
                </p>
                <Button onClick={handleOpenFullScreen} className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Ver PDF completo
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 shrink-0 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!blobUrl || loading}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Descargar PDF
          </Button>
          {/* Mobile: also show full-screen button in footer */}
          <Button
            size="sm"
            onClick={handleOpenFullScreen}
            disabled={!blobUrl || loading}
            className="sm:hidden gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
