"use client";

import Link from "next/link";
import { Briefcase, Mail } from "lucide-react";
import type { TareaItem } from "./types";

/** Chip de origen en la fila (correo o negocio) con stopPropagation. */
export function TareaOriginChip({ task }: { task: TareaItem }) {
  if (task.emailThreadId) {
    const label = task.emailThreadSubject?.trim() || "Correo";
    return (
      <Link
        href={`/crm/correos?thread=${task.emailThreadId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[12rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <Mail className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }
  if (task.dealId) {
    const label = task.dealTitle?.trim() || "Negocio";
    return (
      <Link
        href={`/crm/deals/${task.dealId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[12rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <Briefcase className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  }
  return null;
}
