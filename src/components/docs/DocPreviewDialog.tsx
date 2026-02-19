"use client";

import { useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";

export type PageType = "a4" | "carta" | "oficio";

const PAGE_SIZES: Record<PageType, { width: string; height: string; label: string }> = {
  a4: { width: "210mm", height: "297mm", label: "A4" },
  carta: { width: "216mm", height: "279mm", label: "Carta" },
  oficio: { width: "216mm", height: "330mm", label: "Oficio" },
};

interface DocPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: unknown;
  pageType?: PageType;
}

/** Normaliza el contenido: puede venir como doc directo o dentro de { content } */
function normalizeContent(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if (o.type === "doc" && Array.isArray(o.content)) return raw;
  if (o.content && typeof o.content === "object" && (o.content as Record<string, unknown>).type === "doc") {
    return o.content;
  }
  return raw;
}

export function DocPreviewDialog({
  open,
  onOpenChange,
  content,
  pageType = "a4",
}: DocPreviewDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeContent(content);
  const html = tiptapToPreviewHtml(normalized);
  const size = PAGE_SIZES[pageType];
  const isEmpty = !html || html.trim().length < 20;

  useEffect(() => {
    if (!open || !containerRef.current) return;
    containerRef.current.scrollTop = 0;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] sm:w-[95vw] max-h-[90vh] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Vista previa del documento</span>
            <span className="text-sm font-normal text-muted-foreground">
              Formato: {size.label}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 bg-muted/30"
        >
          <div
            className="mx-auto bg-white text-slate-900 shadow-lg"
            style={{
              width: size.width,
              minWidth: size.width,
              padding: "24mm 20mm",
              paddingBottom: "40mm",
              fontFamily: "Georgia, serif",
              fontSize: "12pt",
              lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          >
            {isEmpty ? (
              <div className="py-12 text-center text-slate-500">
                <p className="text-sm">No hay contenido para mostrar.</p>
                <p className="mt-1 text-xs">
                  Si generaste el contrato desde un template, verifica que el guardia tenga datos previsionales (AFP, salud) y que el template use los tokens correctos.
                </p>
              </div>
            ) : (
              <div
                dangerouslySetInnerHTML={{ __html: html }}
                className="preview-content [&_.page-break]:border-t-2 [&_.page-break]:border-dashed [&_.page-break]:border-slate-300 [&_.page-break]:mt-6 [&_.page-break]:pt-3 [&_.page-break]:text-center [&_.page-break]:text-xs [&_.page-break]:text-slate-500 [&_table]:max-w-full [&_pre]:overflow-x-auto"
              />
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border shrink-0 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
