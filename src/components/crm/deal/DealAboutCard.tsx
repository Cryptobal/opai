"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DealAboutTechDetails } from "./DealAboutTechDetails";
import { DealAboutQuoteSelect, type DealQuoteSelectProps } from "./DealAboutQuoteSelect";
import { DealInstallationCard } from "./DealInstallationCard";
import type { DealInstallationRef } from "@/lib/crm/deal-installation";
import { InlineEditField } from "@/components/opai/InlineEditField";
import { normalizeMoneyClp } from "@/lib/validations/field-normalizers";

export interface DealAboutCardProps {
  account: { id: string; name: string } | null;
  primaryContact: { id: string; name: string } | null;
  followUpFlowStatus: { label: string; className: string };
  proposalLink: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  quote: DealQuoteSelectProps;
  installation: DealInstallationRef | null;
  montoManual?: string | null;
  onMontoCommit?: (key: string, value: string | null) => Promise<string | null>;
  canEdit?: boolean;
  fichaExtra?: ReactNode;
  hasActiveQuote?: boolean;
}

function LinkChip({ href, icon: Icon, label }: { href: string; icon: typeof Building2; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[13px] font-medium text-primary"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function DealAboutCard({
  account,
  primaryContact,
  followUpFlowStatus,
  proposalLink,
  createdAt,
  updatedAt,
  quote,
  installation,
  montoManual,
  onMontoCommit,
  canEdit = false,
  fichaExtra,
  hasActiveQuote = false,
}: DealAboutCardProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 lg:cursor-default"
      >
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          Ficha
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ds-text-3 transition-transform lg:hidden",
            open && "rotate-180",
          )}
        />
      </button>

      <div className={cn("px-4 pb-3", !open && "max-lg:hidden")}>
        {(account || primaryContact) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {account ? (
              <LinkChip href={`/crm/accounts/${account.id}`} icon={Building2} label={account.name} />
            ) : null}
            {primaryContact ? (
              <LinkChip
                href={`/crm/contacts/${primaryContact.id}`}
                icon={Users}
                label={primaryContact.name}
              />
            ) : null}
          </div>
        )}

        <div className="divide-y divide-ds-border-subtle">
          <DealAboutQuoteSelect {...quote} />
          {onMontoCommit ? (
            <div className="py-1">
              <InlineEditField
                label="Monto manual"
                fieldKey="amount"
                type="money"
                value={montoManual ?? null}
                canEdit={canEdit}
                normalize={normalizeMoneyClp}
                displayValue={(v) => (v ? `$${Number(v).toLocaleString("es-CL")}` : null)}
                onCommit={onMontoCommit}
              />
              {hasActiveQuote ? (
                <p className="pb-1 text-[12px] text-ds-text-4">Ignorado, hay cotización</p>
              ) : null}
            </div>
          ) : null}
          {fichaExtra}
          <DealInstallationCard installation={installation} />
          <div className="flex min-h-10 items-center justify-between gap-3 py-2">
            <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
              Flujo seguimiento
            </span>
            <Badge variant="outline" className={followUpFlowStatus.className}>
              {followUpFlowStatus.label}
            </Badge>
          </div>
        </div>
        {proposalLink ? (
          <a
            href={proposalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-10 items-center gap-1 text-[13px] text-primary hover:underline"
          >
            Ver propuesta <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <DealAboutTechDetails createdAt={createdAt} updatedAt={updatedAt} />
      </div>
    </div>
  );
}
