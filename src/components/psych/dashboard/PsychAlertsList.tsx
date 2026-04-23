"use client";

import type { PsychAlert } from "@/lib/psych/types";

const SEVERITY_CLS: Record<string, string> = {
  info: "bg-slate-50 text-slate-800 border-slate-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  critical: "bg-rose-50 text-rose-900 border-rose-200",
};

const SEVERITY_ICON: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  critical: "🛑",
};

export default function PsychAlertsList({ alerts }: { alerts: PsychAlert[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <p className="text-sm text-slate-500">
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
