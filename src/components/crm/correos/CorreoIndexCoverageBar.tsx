"use client";

import { useState } from "react";
import { Database, Loader2 } from "lucide-react";

export type IndexCoverage = {
  totalMessages: number;
  indexedMessages: number;
  pct: number;
  oldestIndexedAt: string | null;
};

/** Mínimo de mensajes sin indexar para considerar el backlog material. */
export const COVERAGE_MIN_PENDING = 25;
/** Bajo este porcentaje la búsqueda semántica está realmente degradada. */
export const COVERAGE_MIN_PCT = 90;

type Props = {
  coverage: IndexCoverage | null;
  onIndexed: (coverage: IndexCoverage) => void;
  compact?: boolean;
  /** Mientras hay sync en curso la barra se oculta (el backlog puede ser desfase). */
  syncing?: boolean;
};

/**
 * Barra de cobertura semántica — visible solo con backlog material:
 * pending ≥ COVERAGE_MIN_PENDING, pct < COVERAGE_MIN_PCT y sin sync en curso.
 */
export function CorreoIndexCoverageBar({
  coverage,
  onIndexed,
  compact,
  syncing = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!coverage || syncing) return null;
  const pending = coverage.totalMessages - coverage.indexedMessages;
  if (pending < COVERAGE_MIN_PENDING || coverage.pct >= COVERAGE_MIN_PCT) return null;

  const indexNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/correos/index-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        coverage?: IndexCoverage;
      };
      if (!res.ok || !data.ok || !data.coverage) {
        setError(data.error || "No se pudo indexar ahora.");
        return;
      }
      onIndexed(data.coverage);
    } catch {
      setError("Error de red al indexar.");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-[12px] text-ds-text-3">
        <Database className="h-3.5 w-3.5 shrink-0 text-ds-text-4" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          Indexados {coverage.indexedMessages}/{coverage.totalMessages} ({coverage.pct}%)
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void indexNow()}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-ds-surface-2 px-3 text-[12px] font-medium text-ds-text-1 ds-tap disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Indexar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2">
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 shrink-0 text-ds-text-4" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ds-text-2">
            Búsqueda por significado: {coverage.indexedMessages} de {coverage.totalMessages}{" "}
            mensajes indexados ({coverage.pct}%).
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ds-surface-3">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(2, coverage.pct)}%` }}
            />
          </div>
          {error && <p className="mt-1 text-[12px] text-status-danger-fg">{error}</p>}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void indexNow()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-[13px] font-medium text-primary ds-tap disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Indexar ahora
        </button>
      </div>
    </div>
  );
}
