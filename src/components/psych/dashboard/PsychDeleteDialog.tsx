"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  assessmentId: string;
  targetName: string;
  onClose: (deleted: boolean) => void;
}

export default function PsychDeleteDialog({
  assessmentId,
  targetName,
  onClose,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canDelete = reason.trim().length >= 10;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/psych/assessments/${assessmentId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Error al eliminar");
      onClose(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-md w-full shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-5 text-status-danger-fg dark:text-status-danger-fg shrink-0 mt-0.5" />
            <h3 className="text-lg font-semibold text-foreground">
              ¿Eliminar esta evaluación?
            </h3>
          </div>
          <button
            onClick={() => onClose(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Esta acción <b>no se puede deshacer</b>. Se borrarán las respuestas,
            el resultado y el análisis IA asociados.
          </p>
          <p>
            Persona evaluada: <b className="text-foreground">{targetName}</b>
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-foreground/90 mb-1 block">
            Razón (mínimo 10 caracteres) *
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Duplicada por error al enviar dos veces al mismo postulante."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm"
          />
          <span className="text-xs text-muted-foreground">
            {reason.trim().length}/500 caracteres
          </span>
        </label>
        {err ? <p className="text-sm text-status-danger-fg dark:text-status-danger-fg">{err}</p> : null}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={() => onClose(false)}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-foreground/90 min-h-[44px] flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || busy}
            className="rounded-lg bg-status-danger text-white hover:brightness-110 disabled:opacity-50 px-4 py-2 min-h-[44px] flex-1"
          >
            {busy ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
