"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Download, File as FileIcon, RefreshCw } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { PdfCanvas } from "./PdfCanvas";

/** Tope de bytes que leemos para previsualizar texto plano. */
const TEXT_MAX = 512 * 1024;

type Kind = "pdf" | "image" | "text" | "other";

/** Clasifica el adjunto por MIME/extensión. HTML/XML/SVG nunca se renderizan
 *  inline (riesgo XSS: el endpoint ya los fuerza a descarga). */
function classify(mimeType: string, filename: string): Kind {
  const mt = (mimeType || "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (mt.includes("html") || mt.includes("xml") || mt.includes("svg") || ["html", "htm", "xml", "svg"].includes(ext)) {
    return "other";
  }
  if (mt.includes("pdf") || ext === "pdf") return "pdf";
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("text/") || mt === "application/json" || ["txt", "csv", "md", "log", "json"].includes(ext)) {
    return "text";
  }
  return "other";
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "pdf"; buffer: ArrayBuffer }
  | { phase: "image"; objectUrl: string }
  | { phase: "text"; text: string; truncated: boolean }
  | { phase: "other" };

/**
 * Cuerpo compartido de previsualización de adjuntos (lector de correo y
 * documentos CRM): baja el binario con la sesión (misma-origen) y lo pinta —
 * PDF en canvas (pdf.js), imagen, texto plano — o muestra una tarjeta tipada
 * con descarga (+ slot de guardado opcional) para el resto. Nunca deja una
 * pantalla en blanco: siempre loading / contenido / error con reintento.
 */
export function AttachmentPreview({
  url,
  filename,
  mimeType,
  size,
  saveSlot,
}: {
  url: string;
  filename: string;
  mimeType: string;
  size?: number;
  /** Acción "Guardar en…" para la tarjeta tipada (opcional). */
  saveSlot?: ReactNode;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const kind = classify(mimeType, filename);

  useEffect(() => {
    // Los tipos sin preview no se descargan: se muestra la tarjeta directo.
    if (kind === "other") {
      setState({ phase: "other" });
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    setState({ phase: "loading" });
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || `No se pudo cargar (error ${r.status})`);
        }
        return r.blob();
      })
      .then(async (blob) => {
        if (!alive) return;
        if (kind === "pdf") {
          setState({ phase: "pdf", buffer: await blob.arrayBuffer() });
        } else if (kind === "image") {
          objectUrl = URL.createObjectURL(blob);
          setState({ phase: "image", objectUrl });
        } else {
          const truncated = blob.size > TEXT_MAX;
          const text = await blob.slice(0, TEXT_MAX).text();
          setState({ phase: "text", text, truncated });
        }
      })
      .catch((err: Error) => {
        if (alive) setState({ phase: "error", message: err.message || "No se pudo cargar el adjunto" });
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, kind, attempt]);

  if (state.phase === "loading") return <Spinner className="mx-auto mt-12" />;

  if (state.phase === "error") {
    return (
      <div className="mx-auto mt-12 max-w-xs space-y-3 px-4 text-center">
        <p className="text-[13px] text-ds-text-2">{state.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  if (state.phase === "pdf") return <PdfCanvas data={state.buffer} />;

  if (state.phase === "image") {
    return (
      <div className="h-full overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica */}
        <img src={state.objectUrl} alt={filename} className="mx-auto max-w-full p-2" />
      </div>
    );
  }

  if (state.phase === "text") {
    return (
      <div className="h-full overflow-auto p-3">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-ds-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ds-text-1">
          {state.text}
          {state.truncated && "\n\n… (vista previa truncada — descargá el archivo para verlo completo)"}
        </pre>
      </div>
    );
  }

  // other → tarjeta tipada
  return (
    <div className="mx-auto mt-12 flex max-w-xs flex-col items-center gap-3 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ds-surface-2">
        <FileIcon className="h-7 w-7 text-ds-text-3" />
      </div>
      <div className="space-y-0.5">
        <p className="break-all text-[13px] font-medium text-ds-text-1">{filename}</p>
        <p className="text-[12px] text-ds-text-4">
          Vista previa no disponible{size ? ` · ${fmtSize(size)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a
          href={url}
          download={filename}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap"
        >
          <Download className="h-4 w-4" /> Descargar
        </a>
        {saveSlot}
      </div>
    </div>
  );
}
