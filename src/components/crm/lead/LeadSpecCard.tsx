"use client";

import { Briefcase, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadSpecCard — resumen estructurado de la solicitud (servicio, solicitante,
 * ubicación) + un <details> con el texto original y UTM. Solo presentación.
 */
export interface LeadSpecCardProps {
  serviceType: string | null;
  detail: string | null;
  contactFullName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
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
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          {label}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">{value}</span>
        {sub && <span className="block truncate text-xs text-ds-text-3">{sub}</span>}
      </div>
    </div>
  );
}

export function LeadSpecCard({
  serviceType,
  detail,
  contactFullName,
  contactPhone,
  contactEmail,
  address,
  commune,
  city,
  rawNotes,
  utm,
  className,
}: LeadSpecCardProps) {
  const location = [address, commune, city].filter(Boolean).join(", ");
  const contactSub = [contactPhone, contactEmail].filter(Boolean).join(" · ");

  return (
    <div className={cn("rounded-2xl border border-ds-border-subtle bg-card p-4", className)}>
      <div className="divide-y divide-ds-border-subtle">
        <Row
          icon={Briefcase}
          iconClass="text-primary"
          label="Servicio"
          value={serviceType || "Sin especificar"}
          sub={detail}
        />
        <Row
          icon={User}
          iconClass="text-tint-violet-fg"
          label="Solicitante"
          value={contactFullName || "—"}
          sub={contactSub || null}
        />
        <Row
          icon={MapPin}
          iconClass="text-tint-sky-fg"
          label="Ubicación"
          value={location || "Sin dirección"}
        />
      </div>

      {(rawNotes || utm) && (
        <details className="group mt-2 border-t border-ds-border-subtle pt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:text-primary/80">
            Texto original y UTM
          </summary>
          {rawNotes && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ds-surface-1 p-3 font-mono text-[12px] leading-relaxed text-ds-text-2">
              {rawNotes}
            </pre>
          )}
          {utm && <p className="mt-2 break-words font-mono text-[12px] text-ds-text-3">{utm}</p>}
        </details>
      )}
    </div>
  );
}
