"use client";

/**
 * Visor fullscreen de documento con botón Compartir (iOS) en el header.
 * Reemplaza `window.open(pdf)` en móvil: el PDF nativo del browser no tiene
 * nuestros controles; este overlay sí.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AttachmentPreview } from "@/components/crm/correos/AttachmentPreview";
import { DocumentShareButton } from "./DocumentShareButton";
import { cn } from "@/lib/utils";

export type DocumentViewerDoc = {
  url: string;
  filename: string;
  mimeType?: string;
};

export function DocumentViewerOverlay({
  doc,
  onClose,
  tone = "dark",
}: {
  doc: DocumentViewerDoc | null;
  onClose: () => void;
  tone?: "dark" | "light";
}) {
  useEffect(() => {
    if (!doc) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [doc, onClose]);

  if (!doc || typeof document === "undefined") return null;

  const dark = tone === "dark";

  const overlay = (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col animate-in fade-in duration-200",
        dark ? "bg-black" : "bg-ds-surface-1",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={doc.filename}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]",
          dark ? "border-white/10 bg-black/80" : "border-ds-border-subtle bg-ds-surface-1",
        )}
      >
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            dark ? "text-white" : "text-ds-text-1",
          )}
          title={doc.filename}
        >
          {doc.filename}
        </p>
        <DocumentShareButton
          url={doc.url}
          filename={doc.filename}
          mimeType={doc.mimeType || "application/pdf"}
          tone={tone}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ds-tap",
            dark
              ? "bg-white/15 text-white hover:bg-white/25"
              : "border border-ds-border-subtle bg-ds-surface-2 text-ds-text-1",
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <AttachmentPreview
          key={doc.url}
          url={doc.url}
          filename={doc.filename}
          mimeType={doc.mimeType || "application/pdf"}
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
