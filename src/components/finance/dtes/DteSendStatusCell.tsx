"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Mail, MailX } from "lucide-react";
import { DocStatusIcon } from "@/components/finance/programacion/SendStatusIcons";
import type { DteRow } from "./shared/types";

/**
 * Columna Envío: en borradores muestra proforma / estado de pago
 * (mismos íconos que Programación). En emitidos, el email de la factura.
 */
export function DteSendStatusCell({ row }: { row: DteRow }) {
  if (row.siiStatus === "DRAFT") {
    return (
      <div className="inline-flex items-center justify-center gap-1.5">
        <DocStatusIcon
          variant="PROFORMA"
          required={row.requireProforma === true}
          status={row.proformaStatus ?? "NONE"}
          sentAt={row.proformaSentAt ?? null}
          sentCount={row.proformaSentCount ?? 0}
          lastRecipient={row.proformaLastRecipient ?? null}
        />
        <DocStatusIcon
          variant="ESTADO_DE_PAGO"
          required={row.requireEstadoPago === true}
          status={row.estadoPagoStatus ?? "NONE"}
          sentAt={row.estadoPagoSentAt ?? null}
          sentCount={row.estadoPagoSentCount ?? 0}
          lastRecipient={row.estadoPagoLastRecipient ?? null}
        />
      </div>
    );
  }

  if (row.emailSentAt) {
    return (
      <span
        title={`Enviado ${format(new Date(row.emailSentAt), "dd MMM yyyy", { locale: es })}`}
        className="inline-flex"
      >
        <Mail className="h-4 w-4 text-status-ok-fg" />
      </span>
    );
  }
  if (row.emailStatus === "FAILED") {
    return (
      <span title="Email falló" className="inline-flex">
        <MailX className="h-4 w-4 text-status-danger-fg" />
      </span>
    );
  }
  return (
    <span title="Sin enviar" className="inline-flex">
      <Mail className="h-4 w-4 text-ds-text-4" />
    </span>
  );
}
