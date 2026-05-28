"use client";

import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import type {
  ProjectionMatrix,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";

export interface CashflowV2ShellProps {
  /** Proyección semanal ya construida en el server (serializada a JSON:
   *  las fechas viajan como ISO string — usar new Date() al consumirlas). */
  projection: ProjectionMatrix;
  canManage: boolean;
  /** Anchor activo del cierre semanal (null si no hay). */
  anchor: ProjectionAnchorInfo | null;
}

/**
 * Flujo de Caja v2 — "la semana es el centro de comando".
 *
 * Pantalla nueva montada sobre los services/endpoints existentes. Se activa
 * solo con ?v=2; sin el flag la página vieja sigue intacta. Esta es la cáscara
 * (shell) que irá ensamblando los bloques de la Fase 0.
 */
export function CashflowV2Shell({ projection, canManage }: CashflowV2ShellProps) {
  void canManage;
  return (
    <div className="space-y-4 min-w-0">
      <BancaTabsHeader active="cashflow" />
      <div className="rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-1 p-6 text-center text-sm text-ds-text-3">
        Flujo de Caja v2 — en construcción ({projection.buckets.length} buckets)
      </div>
    </div>
  );
}
