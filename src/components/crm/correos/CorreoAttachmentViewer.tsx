"use client";

import { Download, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AttachmentPreview } from "./AttachmentPreview";
import { useCloseOnBack } from "./useCloseOnBack";
import { DocumentShareButton } from "@/components/shared/DocumentShareButton";

export type ViewerFile = { url: string; filename: string; mimeType: string; size?: number };

/**
 * Visor de adjuntos en overlay a pantalla completa. Baja el archivo con la
 * sesión y lo previsualiza (PDF en canvas vía pdf.js, imagen, texto, DOCX,
 * Excel/xlsx) o muestra una tarjeta tipada con descarga/compartir. Reemplaza
 * el `<iframe>` sobre `blob:` que dejaba el PDF en blanco en el WebView de
 * iOS/Android.
 *
 * Viaja por portal a `<body>`: los hijos animados de `ds-page-enter` (y el
 * `backdrop-filter` del Surface del lector) crean containing block + stacking
 * context que atrapan el `fixed inset-0` y dejan topbar/rieles por encima.
 */
export function CorreoAttachmentViewer({
  file,
  onClose,
}: {
  file: ViewerFile | null;
  onClose: () => void;
}) {
  useCloseOnBack(Boolean(file), onClose);

  useEffect(() => {
    if (!file) return;
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
  }, [file, onClose]);

  if (!file) return null;

  const overlay = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ds-surface-1 animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
      <header className="flex items-center gap-1.5 border-b border-ds-border-subtle px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1" title={file.filename}>
          {file.filename}
        </p>
        <DocumentShareButton
          url={file.url}
          filename={file.filename}
          mimeType={file.mimeType}
          tone="light"
        />
        <a
          href={file.url}
          download={file.filename}
          aria-label="Descargar"
          title="Descargar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-2 ds-tap"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-2 ds-tap"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <AttachmentPreview
          key={file.url}
          url={file.url}
          filename={file.filename}
          mimeType={file.mimeType}
          size={file.size}
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
