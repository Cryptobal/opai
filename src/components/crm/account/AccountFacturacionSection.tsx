"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
      href={`/finanzas/facturacion/dtes/${dte.id}`}
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

  const { resumen } = facturacion;

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

      <Tabs defaultValue="recientes">
        <TabsList>
          <TabsTrigger value="recientes">
            Recientes ({recientes.length})
          </TabsTrigger>
          <TabsTrigger value="facturas">
            Facturas ({facturas.length})
          </TabsTrigger>
          <TabsTrigger value="nc">
            Notas de crédito ({notasCredito.length})
          </TabsTrigger>
          <TabsTrigger value="nd">
            Notas de débito ({notasDebito.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recientes">
          {recientes.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin DTE emitidos"
              description="Esta cuenta aún no tiene DTE emitidos."
              compact
            />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {recientes.map((d) => (
                <DteCard key={d.id} dte={d} />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </TabsContent>
        <TabsContent value="facturas">
          {facturas.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin facturas"
              description="No hay facturas emitidas asociadas a esta cuenta."
              compact
            />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {facturas.map((d) => (
                <DteCard key={d.id} dte={d} prefix="Factura" />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </TabsContent>
        <TabsContent value="nc">
          {notasCredito.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin notas de crédito"
              description="No hay notas de crédito emitidas para esta cuenta."
              compact
            />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {notasCredito.map((d) => (
                <DteCard key={d.id} dte={d} prefix="NC" />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </TabsContent>
        <TabsContent value="nd">
          {notasDebito.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Sin notas de débito"
              description="No hay notas de débito emitidas para esta cuenta."
              compact
            />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {notasDebito.map((d) => (
                <DteCard key={d.id} dte={d} prefix="ND" />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </TabsContent>
      </Tabs>

      <Link
        href={`/finanzas/facturacion/dtes?accountId=${accountId}`}
        className="block text-xs font-medium text-primary hover:underline"
      >
        Ver todas las facturas de esta cuenta →
      </Link>
    </div>
  );
}
