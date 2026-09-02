"use client";

import Link from "next/link";
import { DetailField } from "@/components/opai/DetailField";
import { EntityRow, Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { formatClDate, formatClDateTime } from "../format";

export function TenantResumenTab({
  tenantId,
  tenant,
  owner,
  access,
  timeline,
  statusChangedAt,
  statusReason,
  trialEndsAt,
  graceEndsAt,
}: {
  tenantId: string;
  tenant: {
    legalName: string | null;
    companyRut: string | null;
    giro: string | null;
    direccion: string | null;
    billingEmail: string | null;
    telefono: string | null;
    createdAt: string;
    signupSource: string | null;
    signupUtm: unknown;
    dpaAcceptedAt: string | null;
    dpaAcceptedBy: string | null;
  };
  owner: { name: string; email: string } | null;
  access: {
    statusLabel: string;
    statusVariant: string;
    daysLeft: number | null;
    missingPlan: boolean;
  };
  statusChangedAt: string | null;
  statusReason: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  timeline: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
}) {
  const utm =
    tenant.signupUtm && typeof tenant.signupUtm === "object"
      ? JSON.stringify(tenant.signupUtm)
      : null;
  const accent =
    access.statusVariant === "danger"
      ? "danger"
      : access.statusVariant === "warn"
        ? "warn"
        : access.missingPlan
          ? "neutral"
          : "ok";

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Surface padding="md" className="lg:col-span-7">
        <h3 className="font-display text-[15px] text-ds-text-1">Empresa</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <DetailField label="Razón social" value={tenant.legalName} />
          <DetailField label="RUT" value={tenant.companyRut} mono />
          <DetailField label="Giro" value={tenant.giro} />
          <DetailField label="Dirección" value={tenant.direccion} />
          <DetailField label="Owner" value={owner?.name} />
          <DetailField label="Email" value={owner?.email ?? tenant.billingEmail} />
          <DetailField label="Teléfono" value={tenant.telefono} mono />
          <DetailField label="Fecha alta" value={formatClDate(tenant.createdAt)} mono />
          <DetailField
            label="Origen"
            value={[tenant.signupSource, utm].filter(Boolean).join(" · ") || null}
          />
          <DetailField
            label="DPA"
            value={
              tenant.dpaAcceptedAt
                ? `${formatClDate(tenant.dpaAcceptedAt)}${tenant.dpaAcceptedBy ? ` · ${tenant.dpaAcceptedBy}` : ""}`
                : null
            }
          />
        </dl>
      </Surface>

      <Surface padding="md" accent={accent} className="lg:col-span-5">
        <h3 className="font-display text-[15px] text-ds-text-1">Ciclo de vida</h3>
        <p className="mt-3 font-display text-2xl text-ds-text-1">{access.statusLabel}</p>
        {statusChangedAt ? (
          <p className="mt-1 font-mono text-[12px] text-ds-text-3">{formatClDateTime(statusChangedAt)}</p>
        ) : null}
        {statusReason ? <p className="mt-1 text-[13px] text-ds-text-2">{statusReason}</p> : null}
        {trialEndsAt ? (
          <p className="mt-1 font-mono text-[12px] text-ds-text-3">Trial: {formatClDate(trialEndsAt)}</p>
        ) : null}
        {graceEndsAt ? (
          <p className="mt-1 font-mono text-[12px] text-ds-text-3">Gracia: {formatClDate(graceEndsAt)}</p>
        ) : null}
        {access.missingPlan ? (
          <Button asChild variant="primary" className="mt-4 h-10 sm:h-9">
            <Link href={`/platform/tenants/${tenantId}?tab=plan`}>Asignar plan</Link>
          </Button>
        ) : null}
        <div className="mt-4 space-y-2">
          {timeline.map((ev) => (
            <EntityRow
              key={ev.id}
              title={ev.action}
              subtitle={`${ev.actorEmail ?? "Sistema"} · ${formatClDateTime(ev.createdAt)}`}
            />
          ))}
        </div>
      </Surface>
    </div>
  );
}
