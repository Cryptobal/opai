"use client";

/**
 * Botón de compartir estilo iOS (cuadrado + flecha ↑).
 * Dispara Web Share API con el archivo; fallback a descarga.
 */

import { useState } from "react";
import { Loader2, Share } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadOrShareFile } from "@/lib/files/download-or-share";

export type DocumentShareButtonProps = {
  url: string;
  filename: string;
  mimeType?: string;
  /** Visual: dark overlay (visor negro) o glass claro. */
  tone?: "dark" | "light";
  /** Tamaño del hit target (siempre ≥44px en móvil). */
  size?: "md" | "lg";
  className?: string;
  /** Si false, solo el ícono sin fondo circular. */
  circular?: boolean;
  onShared?: () => void;
};

export function DocumentShareButton({
  url,
  filename,
  mimeType = "application/pdf",
  tone = "dark",
  size = "lg",
  className,
  circular = true,
  onShared,
}: DocumentShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const dim = size === "lg" ? "h-11 w-11" : "h-10 w-10";

  const handleShare = async () => {
    if (busy || !url) return;
    setBusy(true);
    try {
      const result = await downloadOrShareFile({
        url,
        filename,
        mimeType,
      });
      onShared?.();
      if (result.method === "download") {
        toast.success("Archivo listo para compartir");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo compartir");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      disabled={busy || !url}
      aria-label="Compartir"
      title="Compartir"
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition disabled:opacity-50 ds-tap",
        dim,
        circular &&
          (tone === "dark"
            ? "rounded-full bg-white/15 text-white hover:bg-white/25"
            : "rounded-full border border-ds-border-subtle bg-ds-surface-2 text-ds-text-1 hover:bg-ds-surface-3"),
        !circular &&
          (tone === "dark"
            ? "rounded-xl text-white/90 hover:bg-white/10"
            : "rounded-xl text-ds-text-2 hover:bg-ds-surface-2"),
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <Share className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
