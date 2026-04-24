"use client";

interface Metric {
  label: string;
  value: number | string;
  tone?: "default" | "ok" | "warn" | "bad";
}

const TONE_CLASSES: Record<NonNullable<Metric["tone"]>, string> = {
  default: "bg-card text-foreground",
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bad: "bg-red-500/10 text-red-700 dark:text-red-400",
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
