"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { formatThreadSummary } from "@/modules/crm/email/thread-summary-format";
import type { ContinueAction } from "@/modules/crm/email/correo-continue-actions";

export type ThreadSummaryInitial = {
  text: string;
  generatedAt: string | null;
  stale: boolean;
} | null;

type Props = {
  threadId: string;
  initialSummary: ThreadSummaryInitial;
  /** Cursor capturado al abrir (para since-read). */
  lastReadAt: string | null;
  messageCount: number;
  continueActions: ContinueAction[];
  onAction: (id: ContinueAction["id"]) => void;
  /** true bajo lg: 2 viñetas + carrusel Continuar. */
  compact?: boolean;
};

type CardState = "idle" | "cached" | "stale" | "loading" | "ready" | "error";

function relativeGeneratedAt(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function toneClass(tone: ContinueAction["tone"]): string {
  if (tone === "primary") {
    return "border-tint-violet/40 bg-tint-violet/10 text-tint-violet-fg";
  }
  if (tone === "warn") {
    return "border-status-warn-border bg-status-warn-soft text-status-warn-fg";
  }
  return "border-ds-border-default bg-ds-surface-1 text-ds-text-2";
}

export function CorreoThreadSummaryCard({
  threadId,
  initialSummary,
  lastReadAt,
  messageCount,
  continueActions,
  onAction,
  compact = false,
}: Props) {
  const [text, setText] = useState(initialSummary?.text ?? null);
  const [generatedAt, setGeneratedAt] = useState(initialSummary?.generatedAt ?? null);
  const [stale, setStale] = useState(Boolean(initialSummary?.stale));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sinceSummary, setSinceSummary] = useState<string | null>(null);

  // Reiniciar al cambiar de hilo o de caché del detalle.
  useEffect(() => {
    setText(initialSummary?.text ?? null);
    setGeneratedAt(initialSummary?.generatedAt ?? null);
    setStale(Boolean(initialSummary?.stale));
    setError(null);
    setLoading(false);
    setExpanded(false);
    setSinceSummary(null);
  }, [threadId, initialSummary?.text, initialSummary?.generatedAt, initialSummary?.stale]);

  const state: CardState = loading
    ? "loading"
    : error && !text
      ? "error"
      : text
        ? stale
          ? "stale"
          : text === initialSummary?.text
            ? "cached"
            : "ready"
        : "idle";

  const lines = useMemo(() => (text ? formatThreadSummary(text) : []), [text]);
  const visibleLines = compact && !expanded ? lines.slice(0, 2) : lines;
  const hiddenCount = compact && !expanded ? Math.max(0, lines.length - 2) : 0;
  const relative = relativeGeneratedAt(generatedAt);

  async function requestSummary(mode: "full" | "since-read") {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const body: { mode: "full" | "since-read"; since?: string } = { mode };
      if (mode === "since-read" && lastReadAt) body.since = lastReadAt;
      const res = await fetch(`/api/crm/correos/${threadId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: string;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        setError(data.error || "No se pudo resumir el hilo");
        return;
      }
      if (mode === "since-read") {
        setSinceSummary(data.summary);
      } else {
        setText(data.summary);
        setGeneratedAt(new Date().toISOString());
        setStale(false);
        setSinceSummary(null);
      }
    } catch {
      setError("No se pudo resumir el hilo");
    } finally {
      setLoading(false);
    }
  }

  function handleContinue(id: ContinueAction["id"]) {
    if (id === "since-read") {
      void requestSummary("since-read");
      return;
    }
    onAction(id);
  }

  const showContinue = Boolean(text) && continueActions.length > 0;

  return (
    <div className="space-y-2 rounded-2xl border border-ds-border-subtle bg-ds-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-tint-violet-fg" />
        <p className="text-[12px] font-medium text-ds-text-3">Resumen del hilo</p>
        {relative && state !== "idle" && state !== "loading" && (
          <span className="text-[12px] text-ds-text-4">{relative}</span>
        )}
        {state === "stale" && !loading && (
          <button
            type="button"
            onClick={() => void requestSummary("full")}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full border border-status-warn-border bg-status-warn-soft px-2.5 text-[12px] font-medium text-status-warn-fg ds-tap sm:min-h-8"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar resumen
          </button>
        )}
      </div>

      {state === "idle" && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void requestSummary("full")}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-tint-violet/40 bg-tint-violet/10 px-3 text-ds-body font-medium text-tint-violet-fg ds-tap disabled:opacity-50 sm:min-h-9"
        >
          <Sparkles className="h-4 w-4" /> Resumir hilo
          {messageCount > 0 && (
            <span className="text-[12px] font-normal text-ds-text-3">
              · {messageCount} mensaje{messageCount === 1 ? "" : "s"}
            </span>
          )}
        </button>
      )}

      {state === "loading" && !text && (
        <div className="space-y-2" aria-busy="true" aria-label="Generando resumen">
          <div className="flex items-center gap-2 text-[12px] text-ds-text-3">
            <Spinner className="h-3.5 w-3.5" /> Generando resumen…
          </div>
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-ds-surface-3" />
          <div className="h-2.5 w-9/12 animate-pulse rounded bg-ds-surface-3" />
          <div className="h-2.5 w-7/12 animate-pulse rounded bg-ds-surface-3" />
        </div>
      )}

      {text && (
        <ul className="space-y-1.5">
          {visibleLines.map((line, i) => (
            <li key={`${i}-${line.text.slice(0, 24)}`} className="flex gap-2 text-ds-body leading-5 text-ds-text-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ds-text-3" aria-hidden />
              <span className={line.emphasis ? "font-medium text-ds-text-1" : undefined}>
                {line.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex min-h-11 items-center gap-1 text-[12px] font-medium text-tint-violet-fg ds-tap sm:min-h-8"
        >
          <ChevronDown className="h-3.5 w-3.5" /> Ver las {hiddenCount} restantes
        </button>
      )}
      {compact && expanded && lines.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex min-h-11 items-center gap-1 text-[12px] font-medium text-ds-text-3 ds-tap sm:min-h-8"
        >
          <ChevronUp className="h-3.5 w-3.5" /> Mostrar menos
        </button>
      )}

      {sinceSummary && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft/40 p-2.5">
          <p className="mb-1 text-[12px] font-medium text-status-warn-fg">
            Novedades desde tu lectura
          </p>
          <ul className="space-y-1">
            {formatThreadSummary(sinceSummary).map((line, i) => (
              <li key={`since-${i}`} className="flex gap-2 text-ds-body leading-5 text-ds-text-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-status-warn-fg" aria-hidden />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="space-y-2 rounded-xl border border-status-danger-border bg-status-danger-soft px-2.5 py-2">
          <p className="text-ds-body text-status-danger-fg">{error}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void requestSummary("full")}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] font-medium text-ds-text-1 ds-tap disabled:opacity-50 sm:min-h-8"
          >
            Reintentar
          </button>
        </div>
      )}

      {showContinue && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[12px] font-medium text-ds-text-3">Continuar</p>
          <div
            className={
              compact
                ? "flex gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_proximity]"
                : "flex flex-wrap gap-1.5"
            }
          >
            {continueActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={loading && action.id === "since-read"}
                onClick={() => handleContinue(action.id)}
                className={`inline-flex shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ds-tap disabled:opacity-50 min-h-11 sm:min-h-8 ${
                  compact ? "[scroll-snap-align:start]" : ""
                } ${toneClass(action.tone)}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
