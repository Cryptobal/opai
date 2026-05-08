"use client";

import { Tag } from "@/components/opai-ds";

interface Props {
  count: number;
  hasFullAnnulment: boolean;
  primaryFolio: number;
  creditedNet?: number;
}

/**
 * Badge con info de NCs asociadas al DTE.
 *  - Anulación total → variant danger.
 *  - Múltiples NCs   → variant warn (count).
 *  - Una sola NC     → variant warn con folio.
 */
export function LinkedNoteBadge({
  count,
  hasFullAnnulment,
  primaryFolio,
  creditedNet,
}: Props) {
  if (hasFullAnnulment) {
    return (
      <Tag variant="danger" size="sm">
        Anulada · NC {primaryFolio}
      </Tag>
    );
  }
  if (count > 1) {
    return (
      <Tag variant="warn" size="sm">
        {count} NCs
      </Tag>
    );
  }
  const tooltip = creditedNet != null
    ? `Acreditado $${creditedNet.toLocaleString("es-CL")}`
    : undefined;
  return (
    <Tag variant="warn" size="sm" className="cursor-help">
      <span title={tooltip}>Con NC {primaryFolio}</span>
    </Tag>
  );
}
