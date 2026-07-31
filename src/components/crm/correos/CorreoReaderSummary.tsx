"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { formatThreadSummary } from "@/modules/crm/email/thread-summary-format";
import {
  SummaryBullets,
  SummarySkeleton,
  relativeGeneratedAt,
} from "./correo-summary-view";
import type { ThreadSummaryInitial } from "./CorreoThreadSummaryCard";

type Props = {
  threadId: string;
  /** Caché del detalle (`thread.threadSummary`). Cache-first: no dispara red. */
  initialSummary: ThreadSummaryInitial;
  messageCount: number;
};

/**
 * Resumen del hilo dentro del lector, cache-first.
 *
 * Reglas de red (estrictas): mostrar, colapsar, "Ocultar" y "Ver resumen" NO
 * llaman al servidor — solo el chip sin caché y "Actualizar" hacen POST. Con
 * caché vigente la card se pinta directo desde el detalle.
 */
export function CorreoReaderSummary({ threadId, initialSummary, messageCount }: Props) {
  const [text, setText] = useState(initialSummary?.text ?? null);
  const [generatedAt, setGeneratedAt] = useState(initialSummary?.generatedAt ?? null);
  const [stale, setStale] = useState(Boolean(initialSummary?.stale));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Solo UI: ocultar/mostrar la card ya generada (cero llamadas). */
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setText(initialSummary?.text ?? null);
    setGeneratedAt(initialSummary?.generatedAt ?? null);
    setStale(Boolean(initialSummary?.stale));
    setError(null);
    setLoading(false);
    setHidden(false);
  }, [threadId, initialSummary?.text, initialSummary?.generatedAt, initialSummary?.stale]);

  const lines = useMemo(() => (text ? formatThreadSummary(text) : []), [text]);
  const relative = relativeGeneratedAt(generatedAt);

  async function requestSummary() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: string;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        setError(data.error || "No se pudo resumir el hilo");
        return;
      }
      setText(data.summary);
      setGeneratedAt(new Date().toISOString());
      setStale(false);
      setHidden(false);
    } catch {
      setError("No se pudo resumir el hilo");
    } finally {
      setLoading(false);
    }
  }

  // Chip: sin resumen aún, oculto por el usuario, o error sin contenido.
  if (!text || hidden) {
    const label = hidden ? "Ver resumen" : "✦ Resumir este correo";
    return (
      <div className="my-3 flex flex-col items-center gap-1.5">
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            // Con caché vigente "Ver resumen" es 100% local: no llama a la API.
            if (hidden) {
              setHidden(false);
              return;
            }
            void requestSummary();
          }}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-tint-violet/40 bg-tint-violet/10 px-3.5 text-[13px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50 sm:min-h-9"
        >
          {loading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {loading ? "Generando resumen…" : label}
          {!hidden && messageCount > 0 && (
            <span className="text-[12px] font-normal text-ds-text-3">
              · {messageCount} mensaje{messageCount === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
      </div>
    );
  }

  return (
    <div className="my-3 space-y-2 rounded-2xl border border-tint-violet/30 bg-tint-violet/5 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-tint-violet-fg" aria-hidden />
        <p className="text-[12px] font-medium text-ds-text-3">Resumen del hilo</p>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-ds-text-3 ds-tap hover:text-ds-text-1 sm:min-h-8"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden /> Ocultar
        </button>
      </div>

      {loading ? <SummarySkeleton /> : <SummaryBullets lines={lines} />}

      {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[12px] text-ds-text-4">
          {stale ? "Hay mensajes nuevos" : `Generado ${relative ?? "recién"}`}
          {messageCount > 0
            ? ` · ${messageCount} mensaje${messageCount === 1 ? "" : "s"}`
            : ""}
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void requestSummary()}
          className={`ml-auto inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium ds-tap disabled:opacity-50 sm:min-h-8 ${
            stale
              ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
              : "border-ds-border-default bg-ds-surface-1 text-ds-text-2"
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </button>
      </div>
    </div>
  );
}
