import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  hasFacturacionCapability,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero, ModuleSubNav } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import { DtesEmitidosClient } from "@/components/finance/dtes/DtesEmitidosClient";

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

  // Server-side default: solo el mes en curso. El cliente puede cambiar
  // a otro período (incluido "ALL" = últimos 12 meses) y se hace fetch.
  const now = new Date();
  const monthFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthTo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const initialWhere = {
    tenantId,
    direction: "ISSUED" as const,
    date: { gte: monthFrom, lt: monthTo },
  };

  const [dtes, issuedTotal, suppliers] = await Promise.all([
    prisma.financeDte.findMany({
      where: initialWhere,
      include: { lines: true },
      orderBy: [{ siiStatus: "asc" }, { date: "desc" }, { folio: "desc" }],
      take: INITIAL_PAGE_SIZE,
    }),
    prisma.financeDte.count({ where: initialWhere }),
    prisma.financeSupplier.findMany({
      where: { tenantId },
      select: { id: true, rut: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
  );
  // Fallback por RUT: para DTEs sin crmAccountId poblado, intentamos
  // matchear por receiverRut == account.rut, así igualmente mostramos el
  // nombre de fantasía y la razón social oficial del CRM.
  const receiverRuts = Array.from(
    new Set(dtes.map((d) => d.receiverRut).filter((v): v is string => !!v)),
  );
  const installationIds = Array.from(
    new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
  );
  const CEDIBLE_TYPES = new Set([33, 34, 43, 46]);
  const dteIds = dtes.map((d: typeof dtes[number]) => d.id);
  const [accountsCC, accountsByRut, installationsCC, activeCessions, linkedCreditNotes] = await Promise.all([
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId },
          select: { id: true, name: true, legalName: true, rut: true },
        })
      : Promise.resolve([]),
    receiverRuts.length > 0
      ? prisma.crmAccount.findMany({
          where: { rut: { in: receiverRuts }, tenantId },
          select: { id: true, name: true, legalName: true, rut: true },
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
  const accountByRutMap = new Map(
    accountsByRut.filter((a) => !!a.rut).map((a) => [a.rut as string, a]),
  );
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
    const enrichedAccount =
      (d.crmAccountId ? accountMapCC.get(d.crmAccountId) ?? null : null) ??
      (d.receiverRut ? accountByRutMap.get(d.receiverRut) ?? null : null);
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
      receiverEmailCc: [...d.receiverEmailCc],
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
      crmAccount: enrichedAccount
        ? {
            id: enrichedAccount.id,
            name: enrichedAccount.name,
            legalName: enrichedAccount.legalName,
          }
        : null,
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

  // suppliers ya no se usa en DtesEmitidosClient (solo lo usaba RecibidosTab).
  void suppliers;

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
      <ModuleSubNav moduleKey="finance-compras-ventas" visibility="always" />
      <DtesEmitidosClient
        dtes={dtesData}
        issuedTotal={issuedTotal}
        canManage={canManage}
        forcedSiiStatus={sp.siiStatus ?? null}
        forcedPaymentStatus={sp.paymentStatus ?? null}
      />
    </div>
  );
}
