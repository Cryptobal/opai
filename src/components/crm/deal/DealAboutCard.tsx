"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * DealAboutCard — columna izquierda "Sobre el negocio" de la ficha de deal.
 * Solo presentación: reagrupa piezas que antes vivían en el tab general
 * (cuenta/contacto, cotización activa, flujo de seguimiento, detalles técnicos).
 * Los handlers y el estado del selector de cotización llegan por props (no se
 * reescribe la lógica de `updateActiveQuotation`).
 */
export interface DealAboutCardProps {
  account: { id: string; name: string } | null;
  primaryContact: { id: string; name: string } | null;
  followUpFlowStatus: { label: string; className: string };
  proposalLink: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  quote: {
    selectValue: string;
    onChange: (value: string) => void;
    updating: boolean;
    /** No hay cotizaciones enviadas → selector deshabilitado. */
    hasSent: boolean;
    autoLabel: string;
    options: Array<{ id: string; label: string }>;
    helperText: string;
  };
}

function formatTechDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
        <div className="space-y-1.5">
          <Label>Cotización activa</Label>
          <Select
            value={quote.selectValue}
            onValueChange={quote.onChange}
            disabled={quote.updating || !quote.hasSent}
          >
            <SelectTrigger className="h-auto min-h-9 text-xs">
              <SelectValue
                placeholder={quote.hasSent ? "Selecciona cotización activa" : "Sin cotizaciones enviadas"}
              />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-24px)]">
              <SelectItem value="__auto__" className="whitespace-normal break-words pr-2">
                {quote.autoLabel}
              </SelectItem>
              {quote.options.map((opt) => (
                <SelectItem key={opt.id} value={opt.id} className="whitespace-normal break-words pr-2">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-ds-text-3">{quote.helperText}</p>
          {quote.updating && (
            <div className="inline-flex items-center gap-1 text-[11px] text-ds-text-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando selección…
            </div>
          )}
        </div>

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
        <details className="group border-t border-border/50 pt-2">
          <summary className="flex cursor-pointer list-none select-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
            Detalles técnicos
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ds-text-3">Creación</dt>
              <dd className="text-right tabular-nums">{formatTechDate(createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ds-text-3">Modificación</dt>
              <dd className="text-right tabular-nums">{formatTechDate(updatedAt)}</dd>
            </div>
          </dl>
        </details>
      </div>
    </div>
  );
}
