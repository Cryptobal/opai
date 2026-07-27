"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Download, File as FileIcon, RefreshCw, Share2 } from "lucide-react";
import { MediaZoom } from "./MediaZoom";
import { PdfCanvas } from "./PdfCanvas";

/** Tope de bytes que leemos para previsualizar texto plano / docx. */
const TEXT_MAX = 512 * 1024;
const DOCX_MAX = 8 * 1024 * 1024;

/** Cache en memoria de blobs ya bajados (sesión). Reabrir un adjunto = instantáneo. */
const blobCache = new Map<string, Blob>();
const BLOB_CACHE_MAX = 24;

function cacheBlob(url: string, blob: Blob) {
  if (blobCache.has(url)) blobCache.delete(url);
  blobCache.set(url, blob);
  while (blobCache.size > BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value;
    if (oldest == null) break;
    blobCache.delete(oldest);
  }
}

type Kind = "pdf" | "image" | "text" | "docx" | "other";

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
  if (
    mt.includes("wordprocessingml") ||
    mt === "application/msword" ||
    ext === "docx"
  ) {
    // .doc (binario legacy) no lo convierte mammoth; solo docx/OOXML.
    if (ext === "doc" && !mt.includes("wordprocessingml")) return "other";
    return "docx";
  }
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
  | { phase: "docx"; html: string }
  | { phase: "other" };

async function shareOrDownload(url: string, filename: string, mimeType: string) {
  try {
    let blob = blobCache.get(url);
    if (!blob) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("download failed");
      blob = await res.blob();
      cacheBlob(url, blob);
    }
    const type = mimeType || blob.type || "application/octet-stream";
    const file = new File([blob], filename, { type });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // Caemos a descarga directa.
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function blobToState(blob: Blob, kind: Kind): Promise<State> {
  if (kind === "pdf") {
    return { phase: "pdf", buffer: await blob.arrayBuffer() };
  }
  if (kind === "image") {
    return { phase: "image", objectUrl: URL.createObjectURL(blob) };
  }
  if (kind === "docx") {
    if (blob.size > DOCX_MAX) return { phase: "other" };
    const mammoth = await import("mammoth");
    const arrayBuffer = await blob.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const DOMPurify = (await import("isomorphic-dompurify")).default;
    const html = DOMPurify.sanitize(result.value || "<p>(Documento vacío)</p>");
    return { phase: "docx", html };
  }
  const truncated = blob.size > TEXT_MAX;
  const text = await blob.slice(0, TEXT_MAX).text();
  return { phase: "text", text, truncated };
}

/**
 * Cuerpo compartido de previsualización de adjuntos (lector de correo y
 * documentos CRM): baja el binario con la sesión (misma-origen) y lo pinta —
 * PDF en canvas (pdf.js), imagen con pinch-zoom, texto plano, DOCX (mammoth) —
 * o muestra una tarjeta tipada con descarga/compartir. Cachea blobs en memoria
 * para reabrir sin latencia. Nunca deja pantalla en blanco.
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
  const [sharing, setSharing] = useState(false);
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

    void (async () => {
      try {
        let blob = blobCache.get(url) ?? null;
        if (!blob) {
          const r = await fetch(url);
          if (!r.ok) {
            const data = (await r.json().catch(() => null)) as { error?: string } | null;
            throw new Error(data?.error || `No se pudo cargar (error ${r.status})`);
          }
          blob = await r.blob();
          cacheBlob(url, blob);
        }
        if (!alive) return;
        const next = await blobToState(blob, kind);
        if (next.phase === "image") objectUrl = next.objectUrl;
        if (alive) setState(next);
      } catch (err) {
        if (alive) {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "No se pudo cargar el adjunto",
          });
        }
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, kind, attempt]);

  const actions = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <a
        href={url}
        download={filename}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap"
      >
        <Download className="h-4 w-4" /> Descargar
      </a>
      <button
        type="button"
        disabled={sharing}
        onClick={() => {
          setSharing(true);
          void shareOrDownload(url, filename, mimeType).finally(() => setSharing(false));
        }}
        className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap disabled:opacity-50"
      >
        <Share2 className="h-4 w-4" /> {sharing ? "…" : "Compartir"}
      </button>
      {saveSlot}
    </div>
  );

  if (state.phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 py-12">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-ds-surface-3">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="text-[12px] text-ds-text-4">Cargando archivo…</p>
      </div>
    );
  }

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
        {actions}
      </div>
    );
  }

  if (state.phase === "pdf") return <PdfCanvas data={state.buffer} />;

  if (state.phase === "image") {
    return (
      <MediaZoom>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica */}
        <img
          src={state.objectUrl}
          alt={filename}
          className="max-h-[min(100dvh,900px)] max-w-[100vw] object-contain p-2"
          draggable={false}
        />
      </MediaZoom>
    );
  }

  if (state.phase === "text") {
    return (
      <div className="h-full overflow-auto p-3 animate-in fade-in duration-150">
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-ds-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ds-text-1">
          {state.text}
          {state.truncated && "\n\n… (vista previa truncada — descargá el archivo para verlo completo)"}
        </pre>
      </div>
    );
  }

  if (state.phase === "docx") {
    return (
      <div className="flex h-full flex-col animate-in fade-in duration-150">
        <div
          className="min-h-0 flex-1 overflow-auto bg-ds-surface-1 p-4 text-[13px] leading-relaxed text-ds-text-1 [-webkit-overflow-scrolling:touch] [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_table]:mb-3 [&_table]:w-full [&_td]:border [&_td]:border-ds-border-subtle [&_td]:p-1.5 [&_th]:border [&_th]:border-ds-border-subtle [&_th]:p-1.5 [&_th]:text-left"
          // HTML sanitizado con DOMPurify arriba.
          dangerouslySetInnerHTML={{ __html: state.html }}
        />
        <div className="shrink-0 border-t border-ds-border-subtle px-3 py-2">{actions}</div>
      </div>
    );
  }

  // other → tarjeta tipada
  return (
    <div className="mx-auto mt-12 flex max-w-xs flex-col items-center gap-3 px-4 text-center animate-in fade-in duration-150">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ds-surface-2">
        <FileIcon className="h-7 w-7 text-ds-text-3" />
      </div>
      <div className="space-y-0.5">
        <p className="break-all text-[13px] font-medium text-ds-text-1">{filename}</p>
        <p className="text-[12px] text-ds-text-4">
          Vista previa no disponible{size ? ` · ${fmtSize(size)}` : ""}
        </p>
        <p className="text-[12px] text-ds-text-3">
          Descargalo al teléfono o compartilo con otra app.
        </p>
      </div>
      {actions}
    </div>
  );
}
