import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import { FacturacionClient } from "@/components/finance/FacturacionClient";

interface SearchParams {
  siiStatus?: string;
  /** UNPAID | PARTIAL | OVERDUE | PAID — proviene de deeplinks de Salud Financiera. */
  paymentStatus?: string;
}

export default async function DtesEmitidosPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/finanzas/facturacion/dtes");
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/rendiciones");
  }

  const sp = (await searchParams) ?? {};
  const tenantId = session.user.tenantId;
  const canManage =
    hasFacturacionCapability(perms, "facturacion_issue") ||
    hasFacturacionCapability(perms, "facturacion_credit_note") ||
    hasFacturacionCapability(perms, "facturacion_void") ||
    hasFacturacionCapability(perms, "facturacion_resend_email") ||
    hasFacturacionCapability(perms, "facturacion_configure");

  const INITIAL_PAGE_SIZE = 50;

  const [dtes, issuedTotal, suppliers] = await Promise.all([
    prisma.financeDte.findMany({
      where: { tenantId, direction: "ISSUED" },
      include: { lines: true },
      orderBy: [{ siiStatus: "asc" }, { createdAt: "desc" }],
      take: INITIAL_PAGE_SIZE,
    }),
    prisma.financeDte.count({ where: { tenantId, direction: "ISSUED" } }),
    prisma.financeSupplier.findMany({
      where: { tenantId },
      select: { id: true, rut: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
  );
  const installationIds = Array.from(
    new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
  );
  const CEDIBLE_TYPES = new Set([33, 34, 43, 46]);
  const dteIds = dtes.map((d: typeof dtes[number]) => d.id);
  const [accountsCC, installationsCC, activeCessions, linkedCreditNotes] = await Promise.all([
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId },
          select: { id: true, name: true, legalName: true },
        })
      : Promise.resolve([]),
    installationIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId },
          select: { id: true, name: true, commune: true },
        })
      : Promise.resolve([]),
    dteIds.length > 0
      ? prisma.financeFactoringOperation.findMany({
          where: {
            tenantId,
            dteId: { in: dteIds },
            status: { in: ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] },
          },
          select: { id: true, code: true, status: true, dteId: true },
        })
      : Promise.resolve([]),
    dteIds.length > 0
      ? prisma.financeDte.findMany({
          where: {
            tenantId,
            dteType: 61,
            referenceDteId: { in: dteIds },
            siiStatus: { not: "ANNULLED" },
          },
          select: {
            folio: true,
            netAmount: true,
            siiStatus: true,
            referenceCode: true,
            referenceDteId: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const accountMapCC = new Map(accountsCC.map((a) => [a.id, a]));
  const installationMapCC = new Map(installationsCC.map((i) => [i.id, i]));
  const cessionByDte = new Map(activeCessions.map((c) => [c.dteId, c]));
  const ncsByDte = new Map<string, typeof linkedCreditNotes>();
  for (const nc of linkedCreditNotes) {
    if (!nc.referenceDteId) continue;
    const arr = ncsByDte.get(nc.referenceDteId) ?? [];
    arr.push(nc);
    ncsByDte.set(nc.referenceDteId, arr);
  }

  const dtesData = dtes.map((d: typeof dtes[number]) => {
    const hasXml = d.dteXml !== null && d.dteXml.length > 0;
    const cession = cessionByDte.get(d.id);
    const canBeCeded =
      CEDIBLE_TYPES.has(d.dteType) &&
      d.siiStatus === "ACCEPTED" &&
      hasXml &&
      !cession;
    const ncs = ncsByDte.get(d.id) ?? [];
    const activeNcs = ncs.filter((n) =>
      ["ACCEPTED", "PENDING", "SENT", "WITH_OBJECTIONS"].includes(n.siiStatus),
    );
    const hasFullAnnulment = activeNcs.some((n) => n.referenceCode === 1);
    const creditedNet = activeNcs.reduce(
      (acc, n) => acc + Number(n.netAmount ?? 0),
      0,
    );
    const linkedCreditNote = activeNcs.length > 0
      ? {
          count: activeNcs.length,
          hasFullAnnulment,
          creditedNet,
          primaryFolio:
            activeNcs.find((n) => n.referenceCode === 1)?.folio ??
            activeNcs[0].folio,
        }
      : null;
    return {
      id: d.id,
      dteType: d.dteType,
      folio: d.folio,
      receiverRut: d.receiverRut,
      receiverName: d.receiverName,
      receiverEmail: d.receiverEmail,
      netAmount: d.netAmount.toNumber(),
      taxAmount: d.taxAmount.toNumber(),
      totalAmount: d.totalAmount.toNumber(),
      siiStatus: d.siiStatus,
      currency: d.currency,
      linesCount: d.lines.length,
      createdAt: d.createdAt.toISOString(),
      emailSentAt: d.emailSentAt ? d.emailSentAt.toISOString() : null,
      emailStatus: d.emailStatus,
      referenceType: d.referenceType,
      referenceFolio: d.referenceFolio,
      hasXml,
      crmAccountId: d.crmAccountId,
      installationId: d.installationId,
      crmAccount: d.crmAccountId ? accountMapCC.get(d.crmAccountId) ?? null : null,
      installation: d.installationId
        ? installationMapCC.get(d.installationId) ?? null
        : null,
      canBeCeded,
      activeCession: cession
        ? { id: cession.id, code: cession.code, status: cession.status }
        : null,
      date: d.date.toISOString(),
      dueDate: d.dueDate ? d.dueDate.toISOString() : null,
      paymentStatus: d.paymentStatus,
      linkedCreditNote,
    };
  });

  const initialKpis = {
    ventasMes: 0,
    ivaDebitoMes: 0,
    pendientesSii: 0,
    facturasMes: 0,
    foliosDisponibles: 0,
    foliosLowCount: 0,
    comparison: { vs: "vs mes anterior", pct: 0 },
    periodLabel: "",
  };

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<FileText />}
        iconTone="teal"
        title="DTEs Emitidos"
        description="Documentos tributarios emitidos al SII."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/finanzas/facturacion/emitir">
                <Plus className="h-4 w-4 mr-1.5" />
                Emitir DTE
              </Link>
            </Button>
          ) : undefined
        }
      />
      <FacturacionClient
        dtes={dtesData}
        issuedTotal={issuedTotal}
        canManage={canManage}
        suppliers={suppliers}
        initialKpis={initialKpis}
        view="dtes"
        forcedSiiStatus={sp.siiStatus ?? null}
        forcedPaymentStatus={sp.paymentStatus ?? null}
      />
    </div>
  );
}
