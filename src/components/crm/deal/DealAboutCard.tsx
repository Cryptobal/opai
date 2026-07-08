"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ExternalLink, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DealAboutTechDetails } from "./DealAboutTechDetails";
import { DealAboutQuoteSelect, type DealQuoteSelectProps } from "./DealAboutQuoteSelect";
import { DealInstallationCard } from "./DealInstallationCard";
import type { DealInstallationRef } from "@/lib/crm/deal-installation";

/**
 * DealAboutCard — columna izquierda "Sobre el negocio" de la ficha de deal.
 * Solo presentación: reagrupa cuenta/contacto, cotización activa, flujo de
 * seguimiento y detalles técnicos. Los handlers del selector llegan por props.
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

export function DealAboutCard({
  account,
  primaryContact,
  followUpFlowStatus,
  proposalLink,
  createdAt,
  updatedAt,
  quote,
  installation,
}: DealAboutCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header — toggle en mobile, estático en desktop */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 lg:cursor-default"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          Sobre el negocio
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ds-text-3 transition-transform lg:hidden",
            open && "rotate-180"
          )}
        />
      </button>

      <div className={cn("space-y-4 px-4 pb-4", open ? "block" : "hidden", "lg:block")}>
        {/* Cuenta + contacto */}
        {(account || primaryContact) && (
          <div className="space-y-1.5">
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

        {/* Cotización activa (selector completo, handler por props) */}
        <DealAboutQuoteSelect {...quote} />

        {/* Instalación de ESTE negocio (derivada de la cotización activa) */}
        <DealInstallationCard installation={installation} />

        {/* Flujo de seguimiento + link propuesta */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.06em] text-ds-text-3">Flujo seguimiento</span>
            <Badge variant="outline" className={followUpFlowStatus.className}>
              {followUpFlowStatus.label}
            </Badge>
          </div>
          {proposalLink && (
            <a
              href={proposalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[13px] text-primary hover:underline"
            >
              Ver propuesta <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Detalles técnicos (colapsable) */}
        <DealAboutTechDetails createdAt={createdAt} updatedAt={updatedAt} />
      </div>
    </div>
  );
}
