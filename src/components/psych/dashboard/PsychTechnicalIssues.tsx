"use client";

import type { PsychAlert } from "@/lib/psych/types";
import PsychAlertEvidence from "./PsychAlertEvidence";

export default function PsychTechnicalIssues({
  alerts,
  onRescore,
}: {
  alerts: PsychAlert[];
  onRescore?: () => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
      <h3 className="font-semibold text-foreground mb-2">Calidad técnica</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Estas incidencias son fallas técnicas (timeouts, cuotas API), no
        observaciones del candidato. Reintenta con &quot;Recalcular&quot; si el servicio
        ya está disponible.
      </p>
      <ul className="space-y-2">
        {alerts.map((a, i) => (
          <li key={`${a.code}-${i}`} className="border-l-2 border-amber-500/40 pl-3">
            <p className="text-foreground/90">{a.message}</p>
            <PsychAlertEvidence evidence={a.evidence} />
          </li>
        ))}
      </ul>
      {onRescore ? (
        <button
          onClick={onRescore}
          className="mt-3 text-xs rounded-md border border-border px-2.5 py-1.5"
        >
          Recalcular
        </button>
      ) : null}
    </div>
  );
}
