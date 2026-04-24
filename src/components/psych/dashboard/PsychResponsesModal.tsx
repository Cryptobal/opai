"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface ResponseRow {
  itemId: string;
  itemOrder: number;
  value: unknown;
  latencyMs: number | null;
  normalizedScore: number | null;
  fastLatency: boolean;
  item: {
    order: number;
    type: string;
    dimension: string;
    prompt: string;
    options: unknown;
  } | null;
}

interface Props {
  assessmentId: string;
  onClose: () => void;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (typeof v === "object" && v !== null && "value" in v) {
    return String((v as { value: unknown }).value);
  }
  return JSON.stringify(v);
}

export default function PsychResponsesModal({ assessmentId, onClose }: Props) {
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/psych/assessments/${assessmentId}/responses`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setRows(j.rows);
        else setErr(j.error ?? "Error");
      })
      .catch((e) => setErr(String(e)));
  }, [assessmentId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-3xl w-full shadow-xl space-y-3 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Respuestas ítem por ítem
            </h3>
            <p className="text-xs text-muted-foreground">
              {rows?.length ?? "—"} respuestas registradas
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {err ? (
            <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
          ) : null}
          {!rows ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : null}
          {rows?.map((r) => (
            <ResponseCard key={r.itemId} row={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResponseCard({ row }: { row: ResponseRow }) {
  const score = row.normalizedScore;
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
        <span>
          #{row.itemOrder} · {row.item?.type ?? "—"} · {row.item?.dimension ?? "—"}
        </span>
        <span className="flex items-center gap-2">
          {row.fastLatency ? (
            <span className="text-amber-600 dark:text-amber-400">⚡ rápida</span>
          ) : null}
          {row.latencyMs != null ? (
            <span>{Math.round(row.latencyMs / 1000)}s</span>
          ) : null}
        </span>
      </div>
      <p className="text-sm text-foreground/90">{row.item?.prompt}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium break-all">
          {renderValue(row.value)}
        </span>
        {score !== null ? (
          <span className="text-xs text-muted-foreground shrink-0 ml-2">
            score: {score.toFixed(2)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
