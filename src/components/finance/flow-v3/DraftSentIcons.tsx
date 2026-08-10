"use client";

import { ClipboardCheck, FileText } from "lucide-react";
import type { SecondaryMark } from "./cell-meta";

/**
 * Iconos de docs de cobro enviados (proforma / EP) junto al monto del borrador.
 * No pintan la celda: complementan el chip «B».
 */
export function DraftSentIcons({
  marks,
}: {
  marks: SecondaryMark[];
}) {
  const proforma = marks.includes("proforma");
  const ep = marks.includes("estadoPago");
  if (!proforma && !ep) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label="Documentos de cobro enviados"
    >
      {proforma && (
        <span title="Proforma enviada" aria-label="Proforma enviada" role="img">
          <FileText className="h-2.5 w-2.5 text-status-info-fg" aria-hidden />
        </span>
      )}
      {ep && (
        <span title="Estado de pago enviado" aria-label="Estado de pago enviado" role="img">
          <ClipboardCheck className="h-2.5 w-2.5 text-primary" aria-hidden />
        </span>
      )}
    </span>
  );
}
