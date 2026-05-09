"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Paperclip,
  Trash2,
  Download,
  FileText,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type DteAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  publicUrl: string | null;
  storageKey: string | null;
  uploadedAt: string;
};

type Props = {
  /** URL del endpoint de attachments (sin el id del adjunto). Ej: `/api/finance/billing/dtes/abc/attachments`. */
  baseUrl: string;
  /** Si es false, oculta el botón de subir y de borrar (solo lectura). */
  canEdit?: boolean;
  /** Texto explicativo opcional bajo el título. */
  helpText?: string;
};

const ALLOWED_EXTS = ".pdf,.jpg,.jpeg,.png,.webp,.gif";
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <Paperclip className="h-5 w-5 text-muted-foreground" />;
}

export function DteAttachmentsCard({ baseUrl, canEdit = true, helpText }: Props) {
  const [items, setItems] = useState<DteAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Cada DteAttachmentsCard necesita un id único para el <label htmlFor>.
  // Lo derivamos del baseUrl para que sea estable.
  const inputId = `dte-attach-input-${baseUrl}`;

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const r = await fetch(baseUrl, { signal });
        const j = await r.json();
        if (j?.success) setItems(j.data ?? []);
      } catch {
        // Silencio: peor caso muestra lista vacía.
      } finally {
        setLoading(false);
      }
    },
    [baseUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          if (!ALLOWED_MIMES.has(file.type)) {
            toast.error(`"${file.name}": tipo no permitido (PDF, JPG, PNG, WebP, GIF).`);
            continue;
          }
          if (file.size > MAX_BYTES) {
            toast.error(`"${file.name}" supera el máximo de 10 MB.`);
            continue;
          }
          const fd = new FormData();
          fd.append("file", file);
          const r = await fetch(baseUrl, { method: "POST", body: fd });
          const j = await r.json();
          if (!j?.success) {
            toast.error(j?.error ?? `No se pudo subir "${file.name}".`);
            continue;
          }
          setItems((prev) => [...prev, j.data]);
        }
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [baseUrl],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDelete = useCallback(
    async (att: DteAttachment) => {
      if (!confirm(`¿Eliminar "${att.filename}"?`)) return;
      const r = await fetch(`${baseUrl}/${att.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo eliminar el adjunto.");
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    },
    [baseUrl],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Archivos adjuntos
          {items.length > 0 ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              ({items.length})
            </span>
          ) : null}
        </CardTitle>
        {helpText ? (
          <p className="text-xs text-muted-foreground mt-1">{helpText}</p>
        ) : null}
      </CardHeader>

      <CardContent className="pt-3 space-y-3">
        {canEdit ? (
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            className={cn(
              "rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTS}
              className="hidden"
              id={inputId}
              onChange={(e) => {
                handleFiles(e.target.files);
              }}
            />
            <label
              htmlFor={inputId}
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <Paperclip className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm text-muted-foreground">
                {uploading
                  ? "Subiendo…"
                  : "Arrastra archivos aquí o haz clic para seleccionar"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                PDF, JPG, PNG, WebP, GIF · máx 10 MB
              </span>
            </label>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            Sin archivos adjuntos.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((att) => (
              <li
                key={att.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                {IMAGE_MIMES.has(att.mimeType) && att.publicUrl ? (
                  <a
                    href={att.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-10 h-10 rounded overflow-hidden border bg-muted hover:ring-2 hover:ring-primary/50 transition-shadow"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={att.publicUrl}
                      alt={att.filename}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="shrink-0 w-10 h-10 rounded flex items-center justify-center bg-muted">
                    {iconFor(att.mimeType)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {att.publicUrl ? (
                    <a
                      href={att.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium truncate hover:underline"
                      title={att.filename}
                    >
                      {att.filename}
                    </a>
                  ) : (
                    <p className="text-sm font-medium truncate" title={att.filename}>
                      {att.filename}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {fmtBytes(att.size)}
                    {" · "}
                    {new Date(att.uploadedAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {att.publicUrl ? (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Descargar">
                      <a
                        href={att.publicUrl}
                        download={att.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(att)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
