/**
 * Detalle de una operación de factoring (Bloque 7 v3).
 */

import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  hasFacturacionCapability,
  hasModuleAccess,
  resolvePagePerms,
} from "@/lib/permissions-server";
import { getFactoringOperationDetail } from "@/modules/finance/factoring/operations.service";
import { FactoringOperationDetail } from "@/components/finance/factoring/FactoringOperationDetail";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function FactoringOperationDetailPage({ params }: PageParams) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/cesiones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/facturacion");
  }
  const canIssue = hasFacturacionCapability(perms, "facturacion_issue");

  const { id } = await params;
  const op = await getFactoringOperationDetail(session.user.tenantId, id);
  if (!op) notFound();

  // Decimals → number, Dates → ISO strings.
  const operation = {
    id: op.id,
    code: op.code,
    status: op.status,
    notes: op.notes,
    createdBy: op.createdBy,
    createdAt: op.createdAt.toISOString(),
    submittedAt: op.submittedAt ? op.submittedAt.toISOString() : null,
    approvedAt: op.approvedAt ? op.approvedAt.toISOString() : null,
    fundedAt: op.fundedAt ? op.fundedAt.toISOString() : null,
    collectedAt: op.collectedAt ? op.collectedAt.toISOString() : null,
    closedAt: op.closedAt ? op.closedAt.toISOString() : null,
    fechaCesion: op.fechaCesion ? op.fechaCesion.toISOString().slice(0, 10) : null,
    fechaVencimiento: op.fechaVencimiento
      ? op.fechaVencimiento.toISOString().slice(0, 10)
      : null,
    plazoDias: op.plazoDias,
    invoiceAmount: Number(op.invoiceAmount),
    montoCesion: op.montoCesion !== null ? Number(op.montoCesion) : null,
    advanceRate: Number(op.advanceRate),
    advanceAmount: Number(op.advanceAmount),
    interestRate: Number(op.interestRate),
    interestAmount: Number(op.interestAmount),
    commissionAmount: Number(op.commissionAmount),
    netAdvance: Number(op.netAdvance),
    retentionAmount: Number(op.retentionAmount),
    cesionarioRut: op.cesionarioRut,
    cesionarioRazonSoc: op.cesionarioRazonSoc,
    cesionarioEmail: op.cesionarioEmail,
    cesionarioDireccion: op.cesionarioDireccion,
    factoringCompany: op.factoringCompany,
    factoringCompanyId: op.factoringCompanyId,
    cessionMethod: op.cessionMethod,
    aecTrackId: op.aecTrackId,
    cessionSiiStatus: op.cessionSiiStatus,
    cessionLastCheckedAt: op.cessionLastCheckedAt
      ? op.cessionLastCheckedAt.toISOString()
      : null,
    cessionStatusError: op.cessionStatusError,
    hasAecXml: !!op.aecXml && op.aecXml.length > 0,
    emailDeudor: op.emailDeudor,
    otrasCondiciones: op.otrasCondiciones,
    dte: {
      id: op.dte.id,
      dteType: op.dte.dteType,
      folio: op.dte.folio,
      receiverRut: op.dte.receiverRut,
      receiverName: op.dte.receiverName ?? "",
      siiStatus: op.dte.siiStatus,
      totalAmount: Number(op.dte.totalAmount),
      date: op.dte.date.toISOString().slice(0, 10),
    },
  };

  return <FactoringOperationDetail operation={operation} canIssue={canIssue} />;
}
