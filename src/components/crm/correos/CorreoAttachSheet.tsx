"use client";

import { useRef } from "react";
import { Camera, File, Image as ImageIcon, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Reutiliza `useEmailAttachments().addFiles` del composer. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

/**
 * Sheet Adjuntar móvil: Fotos / Cámara / Archivos → pipeline existente.
 * Sin Google Drive (fuera de alcance).
 */
export function CorreoAttachSheet({ open, onClose, onFiles, disabled }: Props) {
  const photosRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function pick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
    onClose();
  }

  const row =
    "flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <Surface
        elevation={2}
        padding="md"
        role="dialog"
        aria-label="Adjuntar"
        className="w-full space-y-2 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3" />
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-ds-text-1">Adjuntar</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          ref={photosRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={filesRef}
          type="file"
          accept="*/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => photosRef.current?.click()}
            className={`${row} border-b border-ds-border-subtle`}
          >
            <ImageIcon className="h-4 w-4 shrink-0 text-ds-text-3" /> Fotos
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className={`${row} border-b border-ds-border-subtle`}
          >
            <Camera className="h-4 w-4 shrink-0 text-ds-text-3" /> Cámara
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => filesRef.current?.click()}
            className={row}
          >
            <File className="h-4 w-4 shrink-0 text-ds-text-3" /> Archivos
          </button>
        </div>
      </Surface>
    </div>
  );
}
