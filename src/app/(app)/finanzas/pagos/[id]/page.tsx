import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Receipt } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero, Surface, SetBreadcrumbTrailing } from "@/components/opai-ds";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const RECORD_TYPE_LABEL: Record<string, string> = {
  COLLECTION: "Cobro (ingreso)",
  DISBURSEMENT: "Pago (egreso)",
};

const RECORD_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  VOIDED: "Anulado",
};

const METHOD_LABEL: Record<string, string> = {
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  CASH: "Efectivo",
  CREDIT_CARD: "Tarjeta",
  FACTORING: "Factoring",
  COMPENSATION: "Compensación",
  OTHER: "Otro",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FinancePaymentRecordReceiptPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/finanzas/pagos/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasCapability(perms, "banking_view")) {
    redirect("/finanzas");
  }

  const tenantId = session.user.tenantId;

  const record = await prisma.financePaymentRecord.findFirst({
    where: { id, tenantId },
    include: {
      bankAccount: {
        select: { id: true, bankName: true, accountNumber: true },
      },
      bankTransaction: {
        select: {
          id: true,
          description: true,
          transactionDate: true,
          reference: true,
        },
      },
      allocations: {
        select: {
          amount: true,
          dte: {
            select: {
              id: true,
              folio: true,
              documentType: true,
              direction: true,
              receiverName: true,
              issuerName: true,
              totalAmount: true,
              paymentStatus: true,
            },
          },
        },
      },
      supplier: { select: { name: true, rut: true } },
    },
  });

  if (!record) {
    notFound();
  }

  const code = record.code;
  const recordedAtLabel = format(new Date(record.date), "EEEE d MMM yyyy", {
    locale: es,
  });

  return (
    <div className="space-y-6 min-w-0 ds-page-enter">
      <SetBreadcrumbTrailing value={code} />
      <PageHero
        icon={<Receipt />}
        iconTone="teal"
        title={code}
        subtitle="Recibo de pago (ERP)"
        description="Registro contable originado desde conciliación bancaria u otro flujo que creó este documento."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Surface elevation={1} padding="md" className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-3 mb-3">
            Resumen
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ds-text-3">Tipo</dt>
              <dd className="font-medium text-right">
                {RECORD_TYPE_LABEL[record.type] ?? record.type}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ds-text-3">Estado</dt>
              <dd className="font-medium text-right">
                {RECORD_STATUS_LABEL[record.status] ?? record.status}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ds-text-3">Fecha registro</dt>
              <dd className="text-right capitalize">{recordedAtLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ds-text-3">Monto</dt>
              <dd className="font-mono font-semibold text-right">
                {fmtCLP.format(record.amount.toNumber())}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ds-text-3">Medio</dt>
              <dd className="text-right">
                {METHOD_LABEL[record.paymentMethod] ?? record.paymentMethod}
              </dd>
            </div>
            {record.transferReference?.trim() && (
              <div className="flex justify-between gap-3">
                <dt className="text-ds-text-3">Ref. transferencia</dt>
                <dd className="font-mono text-xs text-right break-all">
                  {record.transferReference}
                </dd>
              </div>
            )}
            {record.bankAccount && (
              <div className="flex justify-between gap-3">
                <dt className="text-ds-text-3">Cuenta bancaria</dt>
                <dd className="text-right">
                  {record.bankAccount.bankName} — {record.bankAccount.accountNumber}
                </dd>
              </div>
            )}
            {record.supplier && (
              <div className="flex justify-between gap-3">
                <dt className="text-ds-text-3">Proveedor</dt>
                <dd className="text-right truncate max-w-[60%]" title={record.supplier.name}>
                  {record.supplier.name}
                </dd>
              </div>
            )}
          </dl>
        </Surface>

        <Surface elevation={1} padding="md" className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-3 mb-3">
            Enlaces
          </h2>
          <ul className="space-y-3 text-sm">
            {record.bankTransaction && (
              <li className="min-w-0">
                <p className="text-ds-text-3 text-xs uppercase tracking-wide mb-1">
                  Movimiento bancario
                </p>
                <Link
                  href={`/finanzas/bancos?tab=transactions&txId=${record.bankTransaction.id}`}
                  className="text-primary hover:underline break-words"
                >
                  Abrir en Bancos
                </Link>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {record.bankTransaction.description}
                </p>
              </li>
            )}
            {!record.bankTransaction && (
              <li className="text-ds-text-3 text-sm">
                Este pago no tiene movimiento bancario vinculado en el sistema (puede
                ser creación legacy u otro origen).
              </li>
            )}
          </ul>
        </Surface>
      </div>

      {record.notes?.trim() && (
        <Surface elevation={1} padding="md" className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-3 mb-2">
            Notas
          </h2>
          <p className="text-sm text-ds-text-2 whitespace-pre-wrap">{record.notes}</p>
        </Surface>
      )}

      {record.allocations.length > 0 && (
        <Surface elevation={1} padding="md" className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ds-text-3 mb-3">
            Asignaciones a documentos tributarios
          </h2>
          <ul className="divide-y divide-ds-border-subtle">
            {record.allocations.map((a) =>
              a.dte ? (
                <li key={a.dte.id} className="py-3 first:pt-0 flex flex-wrap gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/finanzas/facturacion/dtes?openDteId=${a.dte.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.dte.documentType} {a.dte.folio != null ? `N° ${a.dte.folio}` : ""}{" "}
                      ·{" "}
                      {(a.dte.direction === "ISSUED"
                        ? a.dte.receiverName
                        : a.dte.issuerName) ?? "Contraparte"}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1">
                      Estado cobro/pago en DTE: {a.dte.paymentStatus}
                    </p>
                  </div>
                  <p className="font-mono text-sm whitespace-nowrap">
                    {fmtCLP.format(a.amount.toNumber())}
                  </p>
                </li>
              ) : null,
            )}
          </ul>
        </Surface>
      )}
    </div>
  );
}
