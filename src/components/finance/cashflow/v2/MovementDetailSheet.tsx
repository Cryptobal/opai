"use client";

import Link from "next/link";
import { FileText, ExternalLink, type LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CellStatusPill,
  pillVariantFor,
  type PillVariant,
} from "@/components/finance/cashflow/CellStatusPill";
import { cn } from "@/lib/utils";
import type { VirtualOccurrence } from "@/modules/finance/cashflow/types";
import { fmtCLP, toDate } from "./format";
import type { OccMeta } from "./projection-helpers";

interface Props {
  occ: VirtualOccurrence | null;
  meta?: OccMeta;
  onClose: () => void;
}

const fmtDate = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Encabezado en lenguaje claro según el estado de la celda. */
function headline(
  variant: PillVariant,
  occ: VirtualOccurrence,
  meta?: OccMeta,
): string {
  switch (variant) {
    case "PAID": {
      const d = occ.effectiveDate ?? occ.scheduledDate;
      return `Pagada el ${fmtDate.format(toDate(d))} — conciliada con el banco`;
    }
    case "OVERDUE":
      return `Vencida hace ${meta?.daysOverdue ?? 0} días`;
    case "FACTORING":
      return "Cedida a factoring — cobro acelerado";
    case "INVOICED":
      return meta?.dteFolio != null
        ? `Factura N° ${meta.dteFolio} — emitida`
        : "Factura emitida";
    case "DRAFT":
      return "Factura en borrador — sin folio asignado";
    case "VOIDED":
      return "Anulada";
    default:
      return "Proyección — aún no facturada";
  }
}

/** Drawer "qué es esto, en palabras": abre al tocar una fila del detalle y
 *  traduce el estado técnico de la occurrence a lenguaje claro. */
export function MovementDetailSheet({ occ, meta, onClose }: Props) {
  return (
    <Sheet open={occ != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {occ && <DetailBody occ={occ} meta={meta} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ occ, meta }: { occ: VirtualOccurrence; meta?: OccMeta }) {
  const reconciled = occ.bankTransactionId != null;
  const cellStatus = meta?.cellStatus ?? (reconciled ? "PAID" : "PROJECTED");
  const variant = pillVariantFor({
    cellStatus,
    hasFactoring: occ.modoCobro === "FACTORING",
    daysOverdue: meta?.daysOverdue,
  });
  const dteId = meta?.dteId ?? occ.dteId;
  const client = occ.nickname || occ.name || "Sin nombre";
  const hasLinks = dteId != null || occ.crmAccountId != null;
  return (
    <>
      <SheetHeader>
        <CellStatusPill variant={variant} />
        <SheetTitle className="text-[15px] leading-snug">
          {headline(variant, occ, meta)}
        </SheetTitle>
      </SheetHeader>

      <dl className="mt-4 space-y-3 text-[13px]">
        <Field label="Cliente / contrato" value={client} />
        {occ.installationName && (
          <Field label="Instalación" value={occ.installationName} />
        )}
        <Field label="Monto proyectado" value={fmtCLP.format(occ.amountClp)} mono />
        {occ.actualAmountClp != null && (
          <Field
            label="Monto real (banco)"
            value={fmtCLP.format(occ.actualAmountClp)}
            mono
          />
        )}
        {occ.varianceClp != null && occ.varianceClp !== 0 && (
          <Field
            label="Diferencia"
            value={`${occ.varianceClp > 0 ? "+" : ""}${fmtCLP.format(occ.varianceClp)}`}
            mono
          />
        )}
        <Field
          label="Fecha programada"
          value={fmtDate.format(toDate(occ.scheduledDate))}
        />
        {occ.currency === "UF" && (
          <Field
            label="En UF"
            value={`${occ.amountOriginal.toLocaleString("es-CL")} UF${
              occ.ufValueUsed ? ` · UF ${fmtCLP.format(occ.ufValueUsed)}` : ""
            }`}
            mono
          />
        )}
      </dl>

      {hasLinks && (
        <div className="mt-5 space-y-1 border-t border-ds-border-subtle pt-4">
          {dteId != null && (
            <LinkRow
              href={`/finanzas/facturacion/dtes?dte=${dteId}`}
              icon={FileText}
              label="Ver factura (DTE)"
            />
          )}
          {occ.crmAccountId != null && (
            <LinkRow
              href={`/crm/accounts/${occ.crmAccountId}?tab=contracts`}
              icon={ExternalLink}
              label="Ver contrato"
            />
          )}
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-ds-text-3">{label}</dt>
      <dd
        className={cn(
          "text-right text-ds-text-1",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function LinkRow({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center gap-2 text-[13px] text-primary hover:underline"
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </Link>
  );
}
