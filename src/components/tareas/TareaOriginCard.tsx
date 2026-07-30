"use client";

import Link from "next/link";
import { Briefcase, Building2, ExternalLink, Mail } from "lucide-react";
import type { TareaItem } from "./types";

/** Tarjeta de origen (correo / negocio / cuenta) con deep-link. */
export function TareaOriginCard({ task }: { task: TareaItem }) {
  if (task.emailThreadId) {
    const label = task.emailThreadSubject?.trim() || "Ver correo de origen";
    return (
      <OriginBlock label="Origen">
        <Link
          href={`/crm/correos?thread=${task.emailThreadId}`}
          className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-1 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <Mail className="h-4 w-4 shrink-0 text-ds-text-4" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ExternalLink className="h-4 w-4 shrink-0 text-ds-text-4" />
        </Link>
      </OriginBlock>
    );
  }

  if (task.dealId) {
    const label = task.dealTitle?.trim() || "Ver negocio";
    return (
      <OriginBlock label="Origen">
        <Link
          href={`/crm/deals/${task.dealId}`}
          className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-1 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <Briefcase className="h-4 w-4 shrink-0 text-ds-text-4" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {task.accountName && (
            <span className="hidden shrink-0 text-[12px] text-ds-text-4 sm:inline">
              {task.accountName}
            </span>
          )}
          <ExternalLink className="h-4 w-4 shrink-0 text-ds-text-4" />
        </Link>
      </OriginBlock>
    );
  }

  if (task.accountName) {
    return (
      <OriginBlock label="Cuenta">
        <div className="opai-glass-soft flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-[13px] text-ds-text-1">
          <Building2 className="h-4 w-4 shrink-0 text-ds-text-4" />
          <span className="min-w-0 flex-1 truncate">{task.accountName}</span>
        </div>
      </OriginBlock>
    );
  }

  return null;
}

function OriginBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="px-1 text-[12px] font-medium text-ds-text-4">{label}</span>
      {children}
    </div>
  );
}
