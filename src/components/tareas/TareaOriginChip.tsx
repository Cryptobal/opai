"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Briefcase, FileText, Mail, MapPin } from "lucide-react";
import type { TareaItem } from "./types";
import { TareaAccountBadge } from "./TareaAccountBadge";

/** Chips de origen / vinculación CRM en la fila (con stopPropagation). */
export function TareaOriginChip({ task }: { task: TareaItem }) {
  const chips: ReactNode[] = [];

  if (task.emailThreadId) {
    const label = task.emailThreadSubject?.trim() || "Correo";
    chips.push(
      <Link
        key="mail"
        href={`/crm/correos?thread=${task.emailThreadId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[12rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <Mail className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>,
    );
  }

  if (task.accountId && task.accountName) {
    chips.push(
      <TareaAccountBadge
        key="account"
        accountId={task.accountId}
        name={task.accountName}
      />,
    );
  }

  if (task.dealId) {
    const label = task.dealTitle?.trim() || "Negocio";
    chips.push(
      <Link
        key="deal"
        href={`/crm/deals/${task.dealId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[10rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <Briefcase className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>,
    );
  }

  if (task.quoteId && task.quoteLabel) {
    chips.push(
      <Link
        key="quote"
        href={`/cpq/quotes/${task.quoteId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[10rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="truncate">{task.quoteLabel}</span>
      </Link>,
    );
  }

  if (task.installationId && task.installationName) {
    chips.push(
      <Link
        key="inst"
        href={`/crm/installations/${task.installationId}`}
        onClick={(e) => e.stopPropagation()}
        className="opai-glass-soft inline-flex max-w-[10rem] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[12px] text-ds-text-4 hover:text-primary"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{task.installationName}</span>
      </Link>,
    );
  }

  if (!chips.length) return null;
  return <>{chips}</>;
}
