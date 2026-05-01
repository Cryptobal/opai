"use client";

interface Metric {
  label: string;
  value: number | string;
  tone?: "default" | "ok" | "warn" | "bad";
}

const TONE_CLASSES: Record<NonNullable<Metric["tone"]>, string> = {
  default: "bg-card text-foreground",
  ok: "bg-status-ok-soft text-status-ok-fg dark:text-status-ok-fg",
  warn: "bg-status-warn-soft text-status-warn-fg dark:text-status-warn-fg",
  bad: "bg-status-danger-soft text-status-danger-fg dark:text-status-danger-fg",
};

export default function PsychMetricsCards({
  total,
  fit,
  caution,
  notRec,
  average,
}: {
  total: number;
  fit: number;
  caution: number;
  notRec: number;
  average: number;
}) {
  const cards: Metric[] = [
    { label: "Total evaluados", value: total },
    { label: "Aptos", value: fit, tone: "ok" },
    { label: "Con observación", value: caution, tone: "warn" },
    { label: "No recomendados", value: notRec, tone: "bad" },
    { label: "Promedio", value: average.toFixed(1) },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl border border-border p-4 ${TONE_CLASSES[c.tone ?? "default"]}`}
        >
          <p className="text-xs uppercase tracking-wider opacity-70 mb-1">
            {c.label}
          </p>
          <p className="text-2xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
