"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileText, Paperclip, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconBubble } from "./IconBubble";
import { Spinner } from "./Spinner";

export type AttachmentPickerItemStatus = "uploading" | "ready" | "error";

export type AttachmentPickerItem = {
  id: string;
  name: string;
  size: number;
  status: AttachmentPickerItemStatus;
  progress?: number;
  error?: string;
};

export type AttachmentPickerProps = {
  items: AttachmentPickerItem[];
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  className?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPicker({
  items,
  onFiles,
  onRemove,
  onRetry,
  disabled = false,
  accept,
  multiple = true,
  hint = "Máximo 10 archivos · 25 MB en total",
  className,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length > 0) onFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) pick(event.dataTransfer.files);
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-2 p-2.5",
        dragging && "border-primary bg-primary/5",
        className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            pick(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-1 ds-tap disabled:opacity-50 sm:h-10"
        >
          <Paperclip className="h-4 w-4" />
          Adjuntar archivos
        </button>
        <p className="min-w-0 flex-1 text-[12px] text-ds-text-4">
          {dragging ? "Soltá los archivos para adjuntarlos" : hint}
        </p>
      </div>

      {items.length > 0 && (
        <ul className="ds-list-cascade space-y-1.5" aria-label="Adjuntos">
          {items.map((item) => (
            <li
              key={item.id}
              className="opai-glass-soft flex min-w-0 items-center gap-2 rounded-xl px-2 py-2"
            >
              <IconBubble icon={FileText} variant="neutral" size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-[13px] text-ds-text-1">{item.name}</p>
                  <span className="shrink-0 text-[12px] text-ds-text-4">
                    {formatBytes(item.size)}
                  </span>
                </div>
                {item.status === "uploading" && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ds-surface-3">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${Math.max(3, item.progress ?? 0)}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-ds-text-4">
                      {Math.round(item.progress ?? 0)}%
                    </span>
                  </div>
                )}
                {item.status === "error" && (
                  <p className="line-clamp-2 text-[12px] text-status-danger-fg">
                    {item.error || "No se pudo subir"}
                  </p>
                )}
                {item.status === "ready" && (
                  <p className="text-[12px] text-status-ok-fg">Listo para enviar</p>
                )}
              </div>
              {item.status === "uploading" ? (
                <Spinner size="sm" />
              ) : item.status === "error" && onRetry ? (
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  aria-label={`Reintentar ${item.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap sm:h-10 sm:w-10"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Quitar ${item.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-3 ds-tap sm:h-10 sm:w-10"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
