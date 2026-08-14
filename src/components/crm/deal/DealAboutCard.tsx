"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DealAboutTechDetails } from "./DealAboutTechDetails";
import { DealAboutQuoteSelect, type DealQuoteSelectProps } from "./DealAboutQuoteSelect";
import { DealInstallationCard } from "./DealInstallationCard";
import type { DealInstallationRef } from "@/lib/crm/deal-installation";
import { InlineEditField } from "@/components/opai/InlineEditField";
import { normalizeMoneyClp } from "@/lib/validations/field-normalizers";

/**
 * DealAboutCard — columna izquierda "Sobre el negocio" de la ficha de deal.
 * Desktop conserva la composición de PR #1084. Móvil: ficha abierta con filas densas.
 */
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
}

function LinkChip({ href, icon: Icon, label }: { href: string; icon: typeof Building2; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-muted/40"
    >
      <Icon className="h-4 w-4 shrink-0 text-ds-text-3" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function DenseRow({
  label,
  children,
  href,
}: {
  label: string;
  children: ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex min-h-10 items-center justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1 text-right text-[13px] text-ds-text-1">
        {children}
        {href ? <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" /> : null}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
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
}: DealAboutCardProps) {
  const [open, setOpen] = useState(true);

  const montoField = onMontoCommit ? (
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
  ) : null;

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
            open && "rotate-180"
          )}
        />
      </button>

      <div className={cn("px-4 pb-4", !open && "max-lg:hidden")}>
        <div className="divide-y divide-ds-border-subtle lg:hidden">
          {account ? (
            <DenseRow label="Cuenta" href={`/crm/accounts/${account.id}`}>
              <span className="truncate">{account.name}</span>
            </DenseRow>
          ) : null}
          {primaryContact ? (
            <DenseRow label="Contacto" href={`/crm/contacts/${primaryContact.id}`}>
              <span className="truncate">{primaryContact.name}</span>
            </DenseRow>
          ) : null}
        </div>
        {(account || primaryContact) && (
          <div className="mb-4 hidden space-y-1.5 lg:block">
            {account && (
              <LinkChip href={`/crm/accounts/${account.id}`} icon={Building2} label={account.name} />
            )}
            {primaryContact && (
              <LinkChip
                href={`/crm/contacts/${primaryContact.id}`}
                icon={Users}
                label={primaryContact.name}
              />
            )}
          </div>
        )}

        <div className="py-2 lg:py-0 lg:mb-4">
          <DealAboutQuoteSelect {...quote} />
        </div>
        {montoField ? <div className="py-2 lg:py-0 lg:mb-4">{montoField}</div> : null}
        {fichaExtra ? <div className="lg:mb-4">{fichaExtra}</div> : null}

        <div className="py-2 lg:py-0 lg:mb-4">
          <DealInstallationCard installation={installation} />
        </div>

        <div className="lg:hidden">
          <DenseRow label="Flujo seguimiento">
            <Badge variant="outline" className={followUpFlowStatus.className}>
              {followUpFlowStatus.label}
            </Badge>
          </DenseRow>
        </div>
        <div className="hidden space-y-2 lg:block">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] uppercase tracking-[0.06em] text-ds-text-3">Flujo seguimiento</span>
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
            className="mt-2 flex items-center gap-1 text-[13px] text-primary hover:underline"
          >
            Ver propuesta <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <div className="mt-2 lg:mt-4">
          <DealAboutTechDetails createdAt={createdAt} updatedAt={updatedAt} />
        </div>
      </div>
    </div>
  );
}
