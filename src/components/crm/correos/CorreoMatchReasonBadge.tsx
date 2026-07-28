"use client";

import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";

const TONE: Record<NonNullable<CorreoThreadDTO["matchReason"]>, string> = {
  lexical: "bg-status-info-soft text-status-info-fg",
  semantic: "bg-tint-violet text-tint-violet-fg",
  both: "bg-status-ok-soft text-status-ok-fg",
};

const LABEL: Record<NonNullable<CorreoThreadDTO["matchReason"]>, string> = {
  lexical: "Texto exacto",
  semantic: "Por significado",
  both: "Texto + significado",
};

/** Badge secundario de motivo de match (solo con búsqueda activa). */
export function CorreoMatchReasonBadge({
  reason,
}: {
  reason: CorreoThreadDTO["matchReason"];
}) {
  if (!reason) return null;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[12px] leading-4 ${TONE[reason]}`}
      title={LABEL[reason]}
    >
      {LABEL[reason]}
    </span>
  );
}
