"use client";

import { Briefcase, Building2, Globe, Mail, MapPin, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadSpecCard — filas densas de datos del lead (empresa, contacto, servicio,
 * ubicación, origen) + nota destacada y UTM. Solo presentación.
 */
export interface LeadSpecCardProps {
  companyName?: string | null;
  serviceType: string | null;
  detail: string | null;
  contactFullName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  industry?: string | null;
  source?: string | null;
  rawNotes: string | null;
  utm: string | null;
  className?: string;
}

function Row({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
}: {
  icon: typeof Briefcase;
  iconClass: string;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-surface-3", iconClass)}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          {label}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">{value}</span>
        {sub && <span className="block truncate text-xs text-ds-text-3">{sub}</span>}
      </div>
    </div>
  );
}

export function LeadSpecCard({
  companyName,
  serviceType,
  detail,
  contactFullName,
  contactPhone,
  contactEmail,
  address,
  commune,
  city,
  industry,
  source,
  rawNotes,
  utm,
  className,
}: LeadSpecCardProps) {
  const location = [commune, city].filter(Boolean).join(", ") || address;

  return (
    <div className={cn("rounded-2xl border border-ds-border-subtle bg-card p-4", className)}>
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">
        Datos del lead
      </p>
      <div className="divide-y divide-ds-border-subtle">
        <Row
          icon={Building2}
          iconClass="text-primary"
          label="Empresa"
          value={companyName || "—"}
        />
        <Row
          icon={User}
          iconClass="text-tint-violet-fg"
          label="Contacto"
          value={contactFullName || "—"}
        />
        <Row
          icon={Mail}
          iconClass="text-status-info-fg"
          label="Email"
          value={contactEmail || "—"}
        />
        <Row
          icon={Phone}
          iconClass="text-status-ok-fg"
          label="Teléfono"
          value={contactPhone || "—"}
        />
        <Row
          icon={Briefcase}
          iconClass="text-primary"
          label="Servicio"
          value={serviceType || "Sin especificar"}
          sub={detail}
        />
        <Row
          icon={Building2}
          iconClass="text-tint-sky-fg"
          label="Industria"
          value={industry || "—"}
        />
        <Row
          icon={MapPin}
          iconClass="text-tint-sky-fg"
          label="Comuna"
          value={location || "Sin dirección"}
          sub={address && commune ? address : null}
        />
        <Row
          icon={Globe}
          iconClass="text-ds-text-3"
          label="Origen"
          value={source || "—"}
        />
      </div>

      {rawNotes ? (
        <div className="mt-3 rounded-lg border border-status-info-border bg-status-info-soft px-3 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-status-info-fg">Nota</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ds-text-1">{rawNotes}</p>
        </div>
      ) : null}

      {utm && (
        <details className="group mt-2 border-t border-ds-border-subtle pt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:text-primary/80">
            UTM
          </summary>
          <p className="mt-2 break-words font-mono text-[12px] text-ds-text-3">{utm}</p>
        </details>
      )}
    </div>
  );
}
