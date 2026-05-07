"use client";

/**
 * Tab "Programación" del módulo Facturación (id interno "borradores"
 * por compat de deeplinks). Solo contiene la sección de programación
 * recurrente — las plantillas que el cron usa para generar borradores
 * automáticamente. Los borradores libres viven en la tab "DTEs Emitidos"
 * con un badge "Borrador" para distinguirlos de los emitidos al SII.
 */
import * as React from "react";
import { Repeat } from "lucide-react";
import { RecurringClient } from "./RecurringClient";

export function BorradoresTab({ canManage }: { canManage: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Repeat className="h-5 w-5 text-tint-violet-fg" />
          Programación recurrente
        </h2>
        <p className="text-sm text-muted-foreground">
          Plantillas que generan borradores automáticamente (mensual,
          quincenal, etc). El cron NO emite directo al SII — siempre
          revisás el borrador antes de emitir.
        </p>
      </div>
      <RecurringClient canManage={canManage} />
    </div>
  );
}
