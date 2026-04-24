"use client";

import type { PsychAlert } from "@/lib/psych/types";

const SEVERITY_CLS: Record<string, string> = {
  info: "bg-muted/50 text-foreground/90 border-border",
  warning:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  critical:
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const SEVERITY_ICON: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  critical: "🛑",
};

export default function PsychAlertsList({ alerts }: { alerts: PsychAlert[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin alertas detectadas.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => (
        <li
          key={`${a.code}-${i}`}
          className={`rounded-lg border px-3 py-2 text-sm flex gap-2 items-start ${SEVERITY_CLS[a.severity] ?? SEVERITY_CLS.info}`}
        >
          <span aria-hidden>{SEVERITY_ICON[a.severity] ?? "•"}</span>
          <span>{a.message}</span>
        </li>
      ))}
    </ul>
  );
}
