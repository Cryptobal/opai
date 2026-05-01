"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  uploading?: boolean;
  preview?: {
    name: string;
    size?: number;
    url?: string;
    type?: string;
  } | null;
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
}

export function FileDropZone({
  onFile,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  uploading = false,
  preview,
  onRemove,
  className,
  compact = false,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  // File input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = "";
    },
    [onFile]
  );

  // Paste (Ctrl+V) listener
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFile(file);
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onFile]);

  const acceptTypes = accept
    .split(",")
    .map((t) => t.trim().split("/")[1]?.toUpperCase())
    .filter(Boolean);

  if (uploading) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5", compact ? "p-4" : "p-6", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Subiendo...</span>
      </div>
    );
  }

  if (preview) {
    const isImage = preview.type?.startsWith("image/") || preview.name.match(/\.(jpg|jpeg|png|webp)$/i);
    return (
      <div className={cn("flex items-center gap-3 rounded-lg border border-status-ok-border bg-status-ok-soft p-3", className)}>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background shrink-0">
          {isImage ? <ImageIcon className="h-5 w-5 text-status-ok-fg" /> : <FileText className="h-5 w-5 text-status-ok-fg" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-status-ok-fg truncate">{preview.name}</p>
          {preview.size && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {(preview.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
        {preview.url && (
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
            Ver
          </a>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={dropRef}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50",
        compact ? "p-4" : "p-6",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      <Upload className={cn("mx-auto text-muted-foreground", compact ? "h-5 w-5 mb-1" : "h-7 w-7 mb-2")} />
      <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
        Arrastra el comprobante aquí
      </p>
      <p className="text-xs text-muted-foreground/60 mt-1">
        o <span className="text-primary underline">busca en tu PC</span>{" "}
        · <kbd className="text-primary font-semibold">Ctrl+V</kbd> para pegar
      </p>
      {acceptTypes.length > 0 && (
        <div className="flex gap-1.5 justify-center mt-2">
          {acceptTypes.map((type) => (
            <span key={type} className="text-[10px] text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">
              {type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
