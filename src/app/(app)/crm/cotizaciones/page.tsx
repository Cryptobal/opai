/**
 * CRM - Cotizaciones (CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { CrmCotizacionesClient } from "@/components/crm/CrmCotizacionesClient";
import { CpqIndicators } from "@/components/cpq/CpqIndicators";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { getUfValue } from "@/lib/uf";

export default async function CrmCotizacionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/cotizaciones");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "quotes")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const [quotes, accounts, ufValue] = await Promise.all([
    prisma.cpqQuote.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        clientName: true,
        monthlyCost: true,
        currency: true,
        totalPositions: true,
        totalGuards: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        dealId: true,
        contactId: true,
        parameters: {
          select: { salePriceMonthly: true, marginPct: true },
        },
        additionalLines: {
          select: { precio: true },
        },
      },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getUfValue(),
  ]);

  // Resolver nombres de negocio, cuenta, info de stage, follow-up status y contactos
  const dealIds = quotes.map((q) => q.dealId).filter((id): id is string => Boolean(id));
  const accountIds = quotes.map((q) => q.accountId).filter((id): id is string => Boolean(id));
  let contactIds = quotes.map((q) => q.contactId).filter((id): id is string => Boolean(id));

  const [dealsRaw, accountsMap, followUpCounts] = await Promise.all([
    dealIds.length > 0
      ? prisma.crmDeal.findMany({
          where: { id: { in: dealIds } },
          select: { id: true, title: true, stage: { select: { name: true, color: true } }, primaryContactId: true },
        })
      : Promise.resolve([]),
    accountIds.length > 0
      ? prisma.crmAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }).then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      : Promise.resolve(new Map<string, string>()),
    dealIds.length > 0
      ? prisma.crmFollowUpLog
          .groupBy({ by: ["dealId"], where: { dealId: { in: dealIds }, status: "pending" }, _count: true })
          .then((rows) => new Map(rows.map((r) => [r.dealId, r._count])))
      : Promise.resolve(new Map<string, number>()),
  ]);
  const dealsMap = new Map(dealsRaw.map((r) => [r.id, r.title]));
  const dealStageMap = new Map(dealsRaw.map((r) => [r.id, r.stage ? { name: r.stage.name, color: r.stage.color } : null]));

  // Obtener contactos (de la cotización o del deal)
  dealsRaw.forEach(d => {
    if (d.primaryContactId) contactIds.push(d.primaryContactId);
  });
  contactIds = Array.from(new Set(contactIds));
  
  const contactsRaw = contactIds.length > 0
    ? await prisma.crmContact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const contactsMap = new Map(contactsRaw.map(c => [c.id, `${c.firstName} ${c.lastName}`.trim()]));

  // Enriquecer con salePriceMonthly calculado si está en 0
  const enrichedQuotes = await Promise.all(
    quotes.map(async (q) => {
      let salePriceMonthly = Number(q.parameters?.salePriceMonthly ?? 0);
      const marginPct = Number(q.parameters?.marginPct ?? 13);
      const additionalLinesTotal = q.additionalLines.reduce(
        (sum, l) => sum + Number(l.precio || 0),
        0
      );
      if (salePriceMonthly <= 0) {
        try {
          const summary = await computeCpqQuoteCosts(q.id);
          const margin = marginPct / 100;
          const costsBase =
            summary.monthlyPositions +
            (summary.monthlyUniforms ?? 0) +
            (summary.monthlyExams ?? 0) +
            (summary.monthlyMeals ?? 0) +
            (summary.monthlyVehicles ?? 0) +
            (summary.monthlyInfrastructure ?? 0) +
            (summary.monthlyCostItems ?? 0);
          const bwm = margin < 1 ? costsBase / (1 - margin) : costsBase;
          salePriceMonthly = bwm + (summary.monthlyFinancial ?? 0) + (summary.monthlyPolicy ?? 0);
        } catch {
          // mantener 0 si falla el cálculo
        }
      }
        const resolvedContactId = q.contactId || (q.dealId && dealsMap.get(q.dealId) ? dealsRaw.find(d => d.id === q.dealId)?.primaryContactId : null) || null;
      // Sumar líneas adicionales al precio de venta (igual que el detalle)
      salePriceMonthly += additionalLinesTotal;
      return {
        id: q.id,
        code: q.code,
        name: q.name || q.clientName,
        status: q.status,
        clientName: q.clientName,
        monthlyCost: q.monthlyCost,
        currency: q.currency ?? "CLP",
        salePriceMonthly,
        marginPct,
        totalPositions: q.totalPositions,
        totalGuards: q.totalGuards,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        accountId: q.accountId || null,
        dealId: q.dealId || null,
        dealTitle: (q.dealId && dealsMap.get(q.dealId)) || null,
        accountName: (q.accountId && accountsMap.get(q.accountId)) || null,
        contactId: resolvedContactId,
        contactName: resolvedContactId ? contactsMap.get(resolvedContactId) || null : null,
        dealStageName: (q.dealId && dealStageMap.get(q.dealId)?.name) || null,
        dealStageColor: (q.dealId && dealStageMap.get(q.dealId)?.color) || null,
        pendingFollowUps: (q.dealId && followUpCounts.get(q.dealId)) || 0,
      };
    })
  );

  const initialQuotes = JSON.parse(JSON.stringify(enrichedQuotes));
  const initialAccounts = JSON.parse(JSON.stringify(accounts));

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description="Cotizaciones CPQ vinculadas al CRM"
        actions={<CpqIndicators />}
      />
      <CrmCotizacionesClient quotes={initialQuotes} accounts={initialAccounts} ufValue={ufValue} />
    </>
  );
}
