"use client";

/**
 * Resúmenes del hilo (A01/A02): "Resumir hilo" (cacheado por último mensaje)
 * y "Qué pasó desde mi última lectura" (read-state). El texto llega ya
 * generado server-side con guardas anti-injection y costo loggeado.
 */

import { useState } from "react";
import { History, ScrollText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";

type SummaryState = {
  mode: "full" | "since-read";
  summary: string;
  cached: boolean;
} | null;

export function CorreoSummaryPanel({ threadId }: { threadId: string }) {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run("full")}
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] ds-tap disabled:opacity-50"
        >
          {busy === "full" ? <Spinner className="h-4 w-4" /> : <ScrollText className="h-4 w-4" />}
          Resumir hilo
        </button>
        <button
          type="button"
          onClick={() => void run("since-read")}
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] ds-tap disabled:opacity-50"
        >
          {busy === "since-read" ? <Spinner className="h-4 w-4" /> : <History className="h-4 w-4" />}
          Desde mi última lectura
        </button>
      </div>
      {result && (
        <div className="space-y-1 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
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
