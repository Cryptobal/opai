"use client";

import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { RadarCapability } from "@/modules/crm/email/radar-types";

type Props = {
  thread: CorreoThreadDTO;
  caps: Set<RadarCapability>;
};

const CHIP_BASE =
  "rounded-md border px-1.5 py-0.5 text-[12px] leading-4 font-medium";

/**
 * Chip de acción único por fila (prioridad determinista).
 * Máximo uno; relleno reservado a lo accionable.
 */
export function CorreoActionChip({ thread, caps }: Props) {
  const vertical = thread.vertical;

  if (vertical === "incidentes" && caps.has("radar_operaciones")) {
    return (
      <span
        className={`${CHIP_BASE} border-status-danger-border bg-status-danger-soft text-status-danger-fg`}
      >
        Incidente
      </span>
    );
  }

  if (thread.hasDraft) {
    return (
      <span
        className={`${CHIP_BASE} border-status-warn-border bg-status-warn-soft text-status-warn-fg`}
      >
        Borrador
      </span>
    );
  }

  if (
    caps.has("radar_comercial") &&
    !thread.accountId &&
    !thread.leadId &&
    (thread.possibleLead || vertical === "comercial")
  ) {
    return (
      <span
        className={`${CHIP_BASE} border-primary/40 bg-primary/10 text-primary`}
      >
        Crear lead
      </span>
    );
  }

  return null;
}
