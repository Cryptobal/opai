"use client";

/**
 * Resúmenes del hilo (A01/A02): "Resumir hilo" (cacheado por último mensaje)
 * y "Qué pasó desde mi última lectura" (read-state). El texto llega ya
 * generado server-side con guardas anti-injection y costo loggeado.
 *
 * UI compacta: control segmentado en la fila de chips del lector (sin fila
 * dedicada que robe espacio de lectura).
 */

import { useState } from "react";
import { History, ScrollText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type SummaryState = {
  mode: "full" | "since-read";
  summary: string;
  cached: boolean;
} | null;

type Props = {
  threadId: string;
  /** `inline` = segmentado en la toolbar; `stack` = resultado debajo. */
  variant?: "inline" | "stack";
};

export function CorreoSummaryPanel({ threadId, variant = "stack" }: Props) {
  const [busy, setBusy] = useState<"full" | "since-read" | null>(null);
  const [result, setResult] = useState<SummaryState>(null);

  async function run(mode: "full" | "since-read") {
    setBusy(mode);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: string;
        cached?: boolean;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        toast.error(data.error || "No se pudo resumir el hilo");
        return;
      }
      setResult({ mode, summary: data.summary, cached: Boolean(data.cached) });
    } catch {
      toast.error("No se pudo resumir el hilo");
    } finally {
      setBusy(null);
    }
  }

  const controls = (
    <div
      role="group"
      aria-label="Resúmenes con IA"
      className={cn(
        "inline-flex h-8 items-center overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-1 p-0.5",
        variant === "inline" && "shrink-0",
      )}
    >
      <button
        type="button"
        onClick={() => void run("full")}
        disabled={busy !== null}
        title="Resumir hilo"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium ds-tap disabled:opacity-50",
          result?.mode === "full"
            ? "bg-primary/15 text-primary"
            : "text-ds-text-2 hover:text-ds-text-1",
        )}
      >
        {busy === "full" ? <Spinner className="h-3.5 w-3.5" /> : <ScrollText className="h-3.5 w-3.5" />}
        Resumir
      </button>
      <span aria-hidden className="h-4 w-px bg-ds-border-default" />
      <button
        type="button"
        onClick={() => void run("since-read")}
        disabled={busy !== null}
        title="Desde mi última lectura"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium ds-tap disabled:opacity-50",
          result?.mode === "since-read"
            ? "bg-primary/15 text-primary"
            : "text-ds-text-2 hover:text-ds-text-1",
        )}
      >
        {busy === "since-read" ? <Spinner className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
        Desde lectura
      </button>
    </div>
  );

  return (
    <div className={cn(variant === "stack" ? "space-y-2" : "contents")}>
      {variant === "inline" ? controls : <div className="flex flex-wrap gap-2">{controls}</div>}
      {result && (
        <div className="basis-full space-y-1 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ds-text-3">
            <Sparkles className="h-3.5 w-3.5 text-tint-violet-fg" />
            {result.mode === "full" ? "Resumen del hilo" : "Desde tu última lectura"}
            {result.cached ? " · cacheado" : ""}
          </p>
          <p className="whitespace-pre-wrap text-[13px] leading-5 text-ds-text-2">
            {result.summary}
          </p>
        </div>
      )}
    </div>
  );
}
