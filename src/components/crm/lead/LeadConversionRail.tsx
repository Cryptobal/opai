"use client";

import Link from "next/link";
import { Building2, Users, Briefcase, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/opai-ds";

type DuplicateAccount = { id: string; name: string; rut?: string | null };

type Converted = {
  account?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string | null; lastName: string | null } | null;
  deal?: { id: string; title: string } | null;
};

/**
 * LeadConversionRail — Centro de conversión (workbench v2, 336px glass).
 * Mismo contenido/handlers que la versión anterior; solo cambia el
 * revestimiento visual (glass cards) y el ancho (316→336px) para alinearse
 * con el resto de los centros de control del workbench comercial.
 */
export function LeadConversionRail({
  status,
  preview,
  duplicates,
  useExistingAccountId,
  onLinkExisting,
  onApprove,
  onReject,
  onReopen,
  approving,
  reopening,
  converted,
  rejectionReason,
  rejectionNote,
  source,
  createdAt,
  idleLabel,
}: {
  status: string;
  preview: { account: string; contact: string; deal: string };
  duplicates: DuplicateAccount[];
  useExistingAccountId: string | null;
  onLinkExisting: (id: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
  approving: boolean;
  reopening: boolean;
  converted: Converted | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  source: string | null;
  createdAt: string | null;
  idleLabel: string | null;
}) {
  const editable = status === "pending" || status === "in_review";

  return (
    <div className="mb-4 space-y-3.5 lg:mb-0 lg:ml-6 lg:w-[336px] lg:shrink-0 lg:self-start lg:sticky lg:top-[var(--app-topbar-offset)] lg:max-h-[calc(100dvh-var(--app-topbar-offset))] lg:overflow-y-auto">
      <div className="space-y-3 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-fill)] p-4 shadow-[var(--glass-specular),0_8px_30px_rgba(0,0,0,0.30)] sm:p-[18px]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-ds-text-3">
          Aprobar y convertir
        </p>

        {editable ? (
          <>
            <PreviewRow icon={Building2} label="Cuenta" value={preview.account || "—"} hint="Se creará al aprobar" />
            <PreviewRow icon={Users} label="Contacto" value={preview.contact || "—"} hint="Se vinculará a la cuenta" />
            <PreviewRow icon={Briefcase} label="Negocio" value={preview.deal || "—"} hint="Pipeline comercial" />

            {duplicates.length > 0 ? (
              <div className="rounded-[14px] border border-status-warn-border bg-status-warn-soft p-3 space-y-2">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-status-warn-fg">
                  <AlertTriangle className="h-4 w-4" /> Posible duplicado
                </p>
                <p className="text-[12px] text-ds-text-2">
                  {duplicates[0]?.name}
                  {duplicates[0]?.rut ? ` · ${duplicates[0].rut}` : ""}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full sm:h-9"
                  onClick={() => onLinkExisting(duplicates[0]!.id)}
                >
                  {useExistingAccountId === duplicates[0]?.id ? "Cuenta vinculada" : "Vincular en vez de crear"}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Button type="button" className="h-11 w-full" disabled={approving} onClick={onApprove}>
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aprobar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full text-status-danger-fg"
                disabled={approving}
                onClick={onReject}
              >
                <XCircle className="h-4 w-4" />
                Rechazar
              </Button>
            </div>
          </>
        ) : null}

        {status === "approved" ? (
          <div className="space-y-2">
            <Tag variant="ok" size="sm">Convertido</Tag>
            {converted?.account ? (
              <CreatedLink href={`/crm/accounts/${converted.account.id}`} label="Cuenta" name={converted.account.name} />
            ) : (
              <p className="text-[12px] text-ds-text-3">Cuenta creada (sin enlace persistido).</p>
            )}
            {converted?.contact ? (
              <CreatedLink
                href={`/crm/contacts/${converted.contact.id}`}
                label="Contacto"
                name={[converted.contact.firstName, converted.contact.lastName].filter(Boolean).join(" ") || "Contacto"}
              />
            ) : (
              <p className="text-[12px] text-ds-text-3">Contacto creado (sin enlace persistido).</p>
            )}
            {converted?.deal ? (
              <CreatedLink href={`/crm/deals/${converted.deal.id}`} label="Negocio" name={converted.deal.title} />
            ) : (
              <p className="text-[12px] text-ds-text-3">Negocio creado (sin enlace persistido).</p>
            )}
          </div>
        ) : null}

        {status === "rejected" ? (
          <div className="space-y-2">
            <Tag variant="danger" size="sm">Rechazado</Tag>
            {rejectionReason ? <p className="text-[13px] text-ds-text-1">{rejectionReason}</p> : null}
            {rejectionNote ? <p className="text-[12px] text-ds-text-3">{rejectionNote}</p> : null}
            <Button type="button" className="h-11 w-full" disabled={reopening} onClick={onReopen}>
              {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reabrir
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-[18px] border border-[var(--glass-border)] bg-[var(--glass-fill)] p-4 shadow-[var(--glass-specular),0_8px_30px_rgba(0,0,0,0.30)] sm:p-[18px]">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-ds-text-3">
          Origen y calidad
        </p>
        <MetaRow label="Fuente" value={source || "—"} />
        <MetaRow label="Recibido" value={createdAt || "—"} />
        <MetaRow label="Tiempo sin contactar" value={idleLabel || "—"} />
      </div>
    </div>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-white/[0.07] bg-[var(--glass-fill-soft)] px-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 text-ds-text-3" />
      <div className="min-w-0">
        <p className="text-[12px] text-ds-text-3">{label}</p>
        <p className="truncate text-[13px] font-medium text-ds-text-1">{value}</p>
        <p className="text-[12px] text-ds-text-4">{hint}</p>
      </div>
    </div>
  );
}

function CreatedLink({ href, label, name }: { href: string; label: string; name: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[14px] border border-white/[0.07] bg-[var(--glass-fill-soft)] px-3 py-2 transition hover:bg-white/[0.09]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ds-text-3">{label}</p>
        <p className="truncate text-[13px] font-medium text-ds-text-1">{name}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-ds-text-3" />
    </Link>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-ds-text-3">{label}</span>
      <span className="truncate text-right text-[13px] text-ds-text-1">{value}</span>
    </div>
  );
}
