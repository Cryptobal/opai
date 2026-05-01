"use client";

interface Distribution {
  fit: number;
  caution: number;
  notRecommended: number;
  none: number;
}

interface Props {
  distribution: Distribution;
}

export default function ClientPsychSummaryPanel({ distribution }: Props) {
  const total =
    distribution.fit +
    distribution.caution +
    distribution.notRecommended +
    distribution.none;

  if (total === 0) {
    return null;
  }

  const rows: Array<{ label: string; count: number; cls: string }> = [
    { label: "Apto", count: distribution.fit, cls: "bg-status-ok" },
    { label: "Con observaciones", count: distribution.caution, cls: "bg-status-warn" },
    {
      label: "No recomendado",
      count: distribution.notRecommended,
      cls: "bg-status-danger",
    },
    { label: "Sin evaluación", count: distribution.none, cls: "bg-slate-400" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <h3 className="text-base font-semibold text-foreground">
        Distribución agregada
      </h3>
      <p className="text-xs text-muted-foreground">
        Sin información individual. Los porcentajes se calculan sobre el total
        de guardias asignados a este contrato.
      </p>
      <div className="space-y-2 pt-2">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <div key={r.label}>
              <div className="flex justify-between text-xs text-foreground/90 mb-1">
                <span>{r.label}</span>
                <span>
                  {r.count} · {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${r.cls}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
