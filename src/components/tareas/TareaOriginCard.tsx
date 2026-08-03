"use client";

import Link from "next/link";
import { ExternalLink, Mail } from "lucide-react";
import type { TareaItem } from "./types";

/** Tarjeta de origen del correo (deep-link). La vinculación CRM va aparte. */
export function TareaOriginCard({ task }: { task: TareaItem }) {
  if (!task.emailThreadId) return null;
  const label = task.emailThreadSubject?.trim() || "Ver correo de origen";
  return (
    <div className="space-y-1.5">
      <span className="px-1 text-[12px] font-medium text-ds-text-4">Origen</span>
      <Link
        href={`/crm/correos?thread=${task.emailThreadId}`}
        className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-1 hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <Mail className="h-4 w-4 shrink-0 text-ds-text-4" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ExternalLink className="h-4 w-4 shrink-0 text-ds-text-4" />
      </Link>
    </div>
  );
}
