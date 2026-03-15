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
import { Check, ChevronDown, Download, ExternalLink, FileText, Loader2 } from "lucide-react";

interface TemplateInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface TemplatePreviewModalProps {
  quoteId: string;
  currentTemplateId?: string | null;
  templates: TemplateInfo[];
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplatePreviewModal({
  quoteId,
  currentTemplateId,
  templates,
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplatePreviewModalProps) {
  const initialSlug = templates.find((t) => t.id === currentTemplateId)?.slug ?? templates[0]?.slug;
  const [activeSlug, setActiveSlug] = useState(initialSlug ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const blobCache = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const activeTemplate = templates.find((t) => t.slug === activeSlug);

  useEffect(() => {
    if (isOpen) {
      const slug = templates.find((t) => t.id === currentTemplateId)?.slug ?? templates[0]?.slug ?? "";
      setActiveSlug(slug);
      setShowTemplateSelector(false);
    }
  }, [isOpen, currentTemplateId, templates]);

  const fetchPdf = useCallback(
    async (slug: string) => {
      const cached = blobCache.current.get(slug);
      if (cached) {
        setBlobUrl(cached);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setBlobUrl(null);

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
        blobCache.current.set(slug, url);
        if (!controller.signal.aborted) {
          setBlobUrl(url);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error generando PDF");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [quoteId],
  );

  useEffect(() => {
    if (isOpen && activeSlug) {
      fetchPdf(activeSlug);
    }
  }, [isOpen, activeSlug, fetchPdf]);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      blobCache.current.forEach((url) => URL.revokeObjectURL(url));
      blobCache.current.clear();
    };
  }, []);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `preview-${activeSlug}.pdf`;
    a.click();
  };

  const handleOpenFullScreen = () => {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank");
  };

  const handleSelect = () => {
    if (activeTemplate) onSelectTemplate(activeTemplate.id);
  };

  const isCurrentTemplate = activeTemplate?.id === currentTemplateId;

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
          <div className="flex items-center justify-between">
            <DialogTitle>Vista previa</DialogTitle>
            {/* Current template indicator + toggle for selector */}
            {templates.length > 1 && (
              <button
                type="button"
                onClick={() => setShowTemplateSelector((v) => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                {activeTemplate?.name || "Template"}
                <ChevronDown className={cn("h-3 w-3 transition-transform", showTemplateSelector && "rotate-180")} />
              </button>
            )}
          </div>
          <DialogDescription className="sr-only">
            Compara los templates de propuesta disponibles
          </DialogDescription>
        </DialogHeader>

        {/* Template selector (collapsed by default) */}
        {showTemplateSelector && templates.length > 1 && (
          <>
            {/* Desktop: tabs */}
            <div className="hidden sm:flex gap-1 shrink-0">
              {templates.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => { setActiveSlug(t.slug); setShowTemplateSelector(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    activeSlug === t.slug
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* Mobile: select */}
            <div className="sm:hidden shrink-0">
              <select
                value={activeSlug}
                onChange={(e) => { setActiveSlug(e.target.value); setShowTemplateSelector(false); }}
                className="w-full h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
              >
                {templates.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name} — {t.description}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* PDF viewer */}
        <div className="flex-1 min-h-0 rounded-md border border-border bg-muted/30 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Generando vista previa…</span>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center p-4">
                <FileText className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchPdf(activeSlug)}>
                  Reintentar
                </Button>
              </div>
            </div>
          )}
          {blobUrl && !error && (
            <>
              {/* Desktop: iframe with browser's native PDF viewer (supports multi-page) */}
              <iframe
                src={blobUrl}
                className="hidden sm:block w-full h-full border-0"
                title={`Preview ${activeTemplate?.name}`}
              />
              {/* Mobile: open PDF in full screen (embedded PDFs don't work well on mobile) */}
              <div className="sm:hidden flex flex-col items-center justify-center gap-4 p-6 h-full">
                <FileText className="h-12 w-12 text-teal-400" />
                <p className="text-sm text-foreground font-medium text-center">
                  PDF generado correctamente
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Abre el PDF en pantalla completa para ver todas las páginas
                </p>
                <Button
                  onClick={handleOpenFullScreen}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver PDF completo
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 shrink-0 pt-1">
          <p className="text-[11px] text-muted-foreground">
            {activeTemplate?.description}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!blobUrl || loading}
              className="flex-1 sm:flex-none"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Descargar PDF
            </Button>
            <Button
              size="sm"
              onClick={handleSelect}
              disabled={!activeTemplate || isCurrentTemplate}
              className="flex-1 sm:flex-none"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              {isCurrentTemplate ? "Template actual" : "Usar este template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
