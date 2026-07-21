"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { useCloseOnBack } from "./useCloseOnBack";

export type ViewerFile = { url: string; filename: string; mimeType: string };

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; objectUrl: string };

/**
 * Visor de adjuntos en overlay: baja el archivo con la sesión (fetch) y lo
 * muestra inline (imagen/PDF). Reemplaza el target=_blank crudo, que ante un
 * error dejaba al usuario en una página JSON sin contexto ni reintento (y es
 * frágil en el WebView del app móvil).
 */
export function CorreoAttachmentViewer({
  file,
  onClose,
}: {
  file: ViewerFile | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  useCloseOnBack(Boolean(file), onClose);

  useEffect(() => {
    if (!file) return;
    let objectUrl: string | null = null;
    let alive = true;
    setState({ phase: "loading" });
    fetch(file.url)
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || `No se pudo cargar (error ${r.status})`);
        }
        return r.blob();
      })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ phase: "ready", objectUrl });
      })
      .catch((err: Error) => {
        if (alive) setState({ phase: "error", message: err.message || "No se pudo cargar el adjunto" });
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, attempt]);

  if (!file) return null;
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType.includes("pdf");

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ds-surface-1">
      <header className="flex items-center gap-1.5 border-b border-ds-border-subtle px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1" title={file.filename}>
          {file.filename}
        </p>
        {state.phase === "ready" && (
          <a
            href={state.objectUrl}
            download={file.filename}
            aria-label="Descargar"
            title="Descargar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {state.phase === "loading" && <Spinner className="mx-auto mt-12" />}

        {state.phase === "error" && (
          <div className="mx-auto mt-12 max-w-xs space-y-3 px-4 text-center">
            <p className="text-[13px] text-ds-text-2">{state.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap"
            >
              <RefreshCw className="h-4 w-4" /> Reintentar
            </button>
          </div>
        )}

        {state.phase === "ready" && isImage && (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica
          <img src={state.objectUrl} alt={file.filename} className="mx-auto max-w-full p-2" />
        )}
        {state.phase === "ready" && isPdf && (
          <iframe src={state.objectUrl} title={file.filename} className="h-full w-full border-0" />
        )}
        {state.phase === "ready" && !isImage && !isPdf && (
          <div className="mx-auto mt-12 max-w-xs space-y-3 px-4 text-center">
            <p className="text-[13px] text-ds-text-2">Vista previa no disponible para este tipo de archivo.</p>
            <a
              href={state.objectUrl}
              download={file.filename}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap"
            >
              <Download className="h-4 w-4" /> Descargar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
