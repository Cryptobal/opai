"use client";

import { Download, Share2, X } from "lucide-react";
import { useState } from "react";
import { AttachmentPreview } from "./AttachmentPreview";
import { useCloseOnBack } from "./useCloseOnBack";

export type ViewerFile = { url: string; filename: string; mimeType: string; size?: number };

async function shareFile(url: string, filename: string, mimeType: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fail");
    const blob = await res.blob();
    const file = new File([blob], filename, {
      type: mimeType || blob.type || "application/octet-stream",
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // fallback descarga
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Visor de adjuntos en overlay a pantalla completa. Baja el archivo con la
 * sesión y lo previsualiza (PDF en canvas vía pdf.js, imagen, texto, DOCX) o
 * muestra una tarjeta tipada con descarga/compartir. Reemplaza el `<iframe>`
 * sobre `blob:` que dejaba el PDF en blanco en el WebView de iOS/Android.
 */
export function CorreoAttachmentViewer({
  file,
  onClose,
}: {
  file: ViewerFile | null;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  useCloseOnBack(Boolean(file), onClose);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ds-surface-1">
      <header className="flex items-center gap-1.5 border-b border-ds-border-subtle px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1" title={file.filename}>
          {file.filename}
        </p>
        <button
          type="button"
          disabled={sharing}
          onClick={() => {
            setSharing(true);
            void shareFile(file.url, file.filename, file.mimeType).finally(() => setSharing(false));
          }}
          aria-label="Compartir o guardar en el teléfono"
          title="Compartir"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap disabled:opacity-50"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <a
          href={file.url}
          download={file.filename}
          aria-label="Descargar"
          title="Descargar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap"
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
}
