"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/utils";

/**
 * LedgerInstallationList — subcabecera del bloque de instalaciones dentro del
 * ledger ("N instalaciones · $total · [+ Otra]") + las filas mapeadas por el
 * parent como children.
 */
export interface LedgerInstallationListProps {
  installationCount: number;
  totalClp: number | null;
  isEditable: boolean;
  onAddInstallation: () => void;
  children: React.ReactNode;
}

export function LedgerInstallationList({
  installationCount,
  totalClp,
  isEditable,
  onAddInstallation,
  children,
}: LedgerInstallationListProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-ds-border-subtle py-2.5 pl-8">
        <span className="min-w-0 text-xs text-ds-text-2">
          <span className="font-semibold text-foreground">
            {installationCount} {installationCount === 1 ? "instalación" : "instalaciones"}
          </span>
          {totalClp != null && totalClp > 0 && (
            <span className="text-ds-text-3"> · {formatCLP(totalClp)}/mes</span>
          )}
        </span>
        {isEditable && (
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 text-xs" onClick={onAddInstallation}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Otra
          </Button>
        )}
      </div>
      {installationCount === 0 ? (
        <div className="ml-8 mt-1 rounded-xl border border-dashed border-ds-border-default bg-ds-surface-1/40 px-4 py-8 text-center">
          <p className="text-xs text-ds-text-3">
            Sin instalaciones. Usa &quot;Otra&quot; para comenzar (luego puedes duplicar cada una con el ícono de copiar en su fila).
          </p>
        </div>
      ) : (
        children
      )}
    </>
  );
}
