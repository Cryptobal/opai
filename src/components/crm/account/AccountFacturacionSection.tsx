"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "../CrmRelatedRecordCard";
import { EmptyState } from "@/components/opai-ds/EmptyState";

export type FacturacionDte = {
  id: string;
  dteType: number;
  folio: number;
  date: string;
  dueDate: string | null;
  totalAmount: number;
  netAmount: number;
  paymentStatus: string;
};

export type AccountFacturacion = {
  dtes: FacturacionDte[];
  resumen: {
    totalFacturadoYTD: number;
    porCobrar: number;
    ultimaFacturaDate: string | null;
  };
};

function formatCLP(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

// SII: 33 = factura electrónica, 34 = factura exenta, 39 = boleta,
// 61 = nota de crédito, 56 = nota de débito.
const FACTURA_TYPES = new Set([33, 34, 39]);

type DtePrefix = "Factura" | "NC" | "ND" | "DTE";

function prefixForDteType(dteType: number): DtePrefix {
  if (FACTURA_TYPES.has(dteType)) return "Factura";
  if (dteType === 61) return "NC";
  if (dteType === 56) return "ND";
  return "DTE";
}

function badgeFor(status: string):
  | { label: string; variant?: "default" | "success" | "destructive" }
  | undefined {
  switch (status) {
    case "PAID":
      return { label: "Pagada", variant: "success" };
    case "PARTIAL":
      return { label: "Pago parcial", variant: "default" };
    case "OVERDUE":
      return { label: "Vencida", variant: "destructive" };
    case "CEDED":
      return { label: "Cedida", variant: "default" };
    case "WRITTEN_OFF":
      return { label: "Castigada" };
    case "UNPAID":
      return { label: "Pendiente" };
    default:
      return undefined;
  }
}

function DteCard({
  dte,
  prefix,
}: {
  dte: FacturacionDte;
  /** Si se omite, se deriva del `dteType`. */
  prefix?: DtePrefix;
}) {
  const resolvedPrefix = prefix ?? prefixForDteType(dte.dteType);
  return (
    <CrmRelatedRecordCard
      module="quotes"
      title={`${resolvedPrefix} N° ${dte.folio}`}
      subtitle={`${formatDate(dte.date)} · ${formatCLP(dte.totalAmount)}`}
      badge={badgeFor(dte.paymentStatus)}
      href={`/finanzas/facturacion/dtes?openDteId=${dte.id}`}
    />
  );
}

function ResumenStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-status-warn-fg"
      : tone === "ok"
        ? "text-status-ok-fg"
        : "text-ds-text-1";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-mono uppercase tracking-wider text-ds-text-4">
        {label}
      </p>
      <p className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function AccountFacturacionSection({
  accountId,
  facturacion,
}: {
  accountId: string;
  facturacion: AccountFacturacion;
}) {
  const facturas = facturacion.dtes.filter((d) => FACTURA_TYPES.has(d.dteType));
  const notasCredito = facturacion.dtes.filter((d) => d.dteType === 61);
  const notasDebito = facturacion.dtes.filter((d) => d.dteType === 56);
  const recientes = facturacion.dtes.slice(0, 10);
  const [view, setView] = useState<
    "recientes" | "facturas" | "nc" | "nd"
  >("recientes");

  const { resumen } = facturacion;

  const viewConfig: Record<
    typeof view,
    { label: string; count: number; data: FacturacionDte[]; emptyTitle: string; emptyDesc: string; prefix?: "Factura" | "NC" | "ND" }
  > = {
    recientes: {
      label: "Recientes",
      count: recientes.length,
      data: recientes,
      emptyTitle: "Sin DTE emitidos",
      emptyDesc: "Esta cuenta aún no tiene DTE emitidos.",
    },
    facturas: {
      label: "Facturas",
      count: facturas.length,
      data: facturas,
      emptyTitle: "Sin facturas",
      emptyDesc: "No hay facturas emitidas asociadas a esta cuenta.",
      prefix: "Factura",
    },
    nc: {
      label: "Notas de crédito",
      count: notasCredito.length,
      data: notasCredito,
      emptyTitle: "Sin notas de crédito",
      emptyDesc: "No hay notas de crédito emitidas para esta cuenta.",
      prefix: "NC",
    },
    nd: {
      label: "Notas de débito",
      count: notasDebito.length,
      data: notasDebito,
      emptyTitle: "Sin notas de débito",
      emptyDesc: "No hay notas de débito emitidas para esta cuenta.",
      prefix: "ND",
    },
  };
  const current = viewConfig[view];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <ResumenStat
          label="Facturado YTD"
          value={formatCLP(resumen.totalFacturadoYTD)}
        />
        <ResumenStat
          label="Por cobrar"
          value={formatCLP(resumen.porCobrar)}
          tone={resumen.porCobrar > 0 ? "warn" : "ok"}
        />
        <ResumenStat
          label="Última factura"
          value={
            resumen.ultimaFacturaDate
              ? formatDate(resumen.ultimaFacturaDate)
              : "—"
          }
        />
      </div>

      {/* Selector compacto en lugar de tabs: el panel de "Registros
          asociados" tiene ancho limitado; con tabs horizontales se
          desbordaba y forzaba scroll en todo el sidebar. */}
      <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
        <SelectTrigger className="w-full h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(viewConfig) as (keyof typeof viewConfig)[]).map((k) => (
            <SelectItem key={k} value={k}>
              {viewConfig[k].label} ({viewConfig[k].count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {current.data.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={current.emptyTitle}
          description={current.emptyDesc}
          compact
        />
      ) : (
        <CrmRelatedRecordGrid className="!grid-cols-1">
          {current.data.map((d) => (
            <DteCard key={d.id} dte={d} prefix={current.prefix} />
          ))}
        </CrmRelatedRecordGrid>
      )}

      <Link
        href={`/finanzas/facturacion/dtes?accountId=${accountId}`}
        className="block text-xs font-medium text-primary hover:underline"
      >
        Ver todas las facturas de esta cuenta →
      </Link>
    </div>
  );
}
