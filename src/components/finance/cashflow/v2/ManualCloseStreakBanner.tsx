"use client";

import { AlertTriangle } from "lucide-react";

export interface CloseLite {
  isManual: boolean;
  weekEndDate: string | Date;
}

interface Props {
  recentCloses: CloseLite[];
}

/** Aviso educativo cuando hay ≥3 cierres manuales consecutivos: probablemente
 *  hay un problema de sincronización del banco o de categorización. */
export function ManualCloseStreakBanner({ recentCloses }: Props) {
  const sorted = [...recentCloses].sort(
    (a, b) => new Date(b.weekEndDate).getTime() - new Date(a.weekEndDate).getTime(),
  );
  let streak = 0;
  for (const c of sorted) {
    if (c.isManual) streak++;
    else break;
  }
  if (streak < 3) return null;

  return (
    <div className="flex items-start gap-2 rounded-ds-lg border border-status-warn-border bg-status-warn-soft px-3 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn-fg" />
      <div className="text-[12px] text-ds-text-2">
        <b className="text-status-warn-fg">
          Llevas {streak} cierres manuales consecutivos.
        </b>{" "}
        Vale la pena revisar si hay un problema con la sincronización del banco o con las
        reglas de categorización — no es una buena costumbre tapar diferencias con ajustes
        manuales repetidos.
      </div>
    </div>
  );
}
