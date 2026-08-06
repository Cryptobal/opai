import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import { buildEmailUrl } from "@/lib/emails/site-url";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const quotes = await prisma.cpqQuote.findMany({
    where: {
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    include: {
      positions: { select: { id: true, numGuards: true } },
      parameters: { select: { salePriceMonthly: true, marginPct: true } },
      additionalLines: { select: { precio: true } },
      installation: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch deal titles for quotes that have a dealId (scoped por tenant — seguridad)
  const dealIds = [...new Set(quotes.map((q) => q.dealId).filter(Boolean))] as string[];
  const deals = dealIds.length
    ? await prisma.crmDeal.findMany({
        where: { id: { in: dealIds }, tenantId: session.tenantId },
        select: { id: true, title: true, proposalLink: true },
      })
    : [];
  const dealMap = new Map(deals.map((d) => [d.id, d]));

  // Propuestas multi-instalación: qué cotizaciones pertenecen a un bundle.
  const quoteIdsAll = quotes.map((q) => q.id);
  const bundleMembers = quoteIdsAll.length
    ? await prisma.cpqProposalBundleQuote.findMany({
        where: { quoteId: { in: quoteIdsAll }, tenantId: session.tenantId },
        select: {
          quoteId: true,
          includedInProposal: true,
          displayOrder: true,
          bundle: { select: { id: true, code: true, name: true, currency: true } },
        },
      })
    : [];
  const memberByQuoteId = new Map(bundleMembers.map((m) => [m.quoteId, m]));

  const needsUf = quotes.some((q) => (q.currency || "CLP") === "UF");
  const ufValue = needsUf ? await getUfValue() : 0;

  const quoteIds = quotes.map((q) => q.id);
  let presentationMap = new Map<string, string>();
  try {
    const presentations = await prisma.presentation.findMany({
      where: { quoteId: { in: quoteIds }, status: { not: "draft" } },
      select: { quoteId: true, uniqueId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const tenantRow = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { slug: true },
    });
    const tenantSlug = tenantRow?.slug ?? null;
    for (const p of presentations) {
      if (p.quoteId && !presentationMap.has(p.quoteId)) {
        presentationMap.set(p.quoteId, buildEmailUrl(`/p/${p.uniqueId}`, tenantSlug));
      }
    }
  } catch {}

  // Para cotizaciones sin salePriceMonthly guardado, computar desde costos
  const computedSalePrices = new Map<string, number>();
  const toCompute = quotes.filter((q) => {
    const sp = q.parameters?.salePriceMonthly != null ? Number(q.parameters.salePriceMonthly) : 0;
    return sp <= 0;
  });
  await Promise.all(
    toCompute.map(async (q) => {
      try {
        const costSummary = await computeCpqQuoteCosts(q.id);
        const marginPct = Number(q.parameters?.marginPct ?? 13) / 100;
        const costsBase =
          costSummary.monthlyPositions +
          (costSummary.monthlyHolidayAdjustment ?? 0) +
          (costSummary.monthlyUniforms ?? 0) +
          (costSummary.monthlyExams ?? 0) +
          (costSummary.monthlyMeals ?? 0) +
          (costSummary.monthlyVehicles ?? 0) +
          (costSummary.monthlyInfrastructure ?? 0) +
          (costSummary.monthlyCostItems ?? 0);
        const bwm = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;
        const addl = costSummary.additionalLinesTotalWithMargin ?? 0;
        const salePrice =
          (costSummary.salePriceMonthly ??
            bwm +
              (costSummary.monthlyFinancial ?? 0) +
              (costSummary.monthlyPolicy ?? 0) +
              (costSummary.monthlyPolicyAdmin ?? 0) +
              (costSummary.monthlyLiability ?? 0) +
              addl) - addl;
        computedSalePrices.set(q.id, salePrice);
      } catch {
        // ignorar
      }
    })
  );

  const data = quotes.map((q) => {
    const deal = q.dealId ? dealMap.get(q.dealId) : null;
    const salePriceClp =
      (q.parameters?.salePriceMonthly != null ? Number(q.parameters.salePriceMonthly) : 0) ||
      computedSalePrices.get(q.id) ||
      0;
    const additionalLinesTotal =
      q.additionalLines?.reduce((s, l) => s + Number(l.precio || 0), 0) ?? 0;
    const rawCost = (salePriceClp > 0 ? salePriceClp : (q.monthlyCost?.toNumber() ?? 0)) + additionalLinesTotal;
    const currency = (q.currency || "CLP") as string;
    const monthlyCost = currency === "UF" && ufValue > 0 ? clpToUf(rawCost, ufValue) : rawCost;

    const member = memberByQuoteId.get(q.id);

    return {
      id: q.id,
      code: q.code,
      name: q.clientName ?? deal?.title ?? q.code,
      clientName: q.clientName ?? null,
      installationName: q.installation?.name ?? null,
      quoteName: q.name?.trim() || null,
      status: q.status,
      monthlyCost,
      validUntil: q.validUntil,
      totalPositions: q.positions.length,
      totalGuards: q.positions.reduce((s, p) => s + (p.numGuards ?? 0), 0),
      currency,
      createdAt: q.createdAt,
      dealId: q.dealId ?? null,
      dealTitle: deal?.title ?? null,
      proposalLink: presentationMap.get(q.id) ?? deal?.proposalLink ?? null,
      // Referencia liviana al bundle (null si es cotización standalone).
      proposalId: member?.bundle.id ?? null,
    };
  });

  // ── Agrupar por propuesta (bundle) para el portal ──
  // Cada propuesta multi-instalación se presenta como una unidad; el detalle por
  // instalación sigue disponible a través de las cotizaciones individuales.
  type QuoteRow = (typeof data)[number];
  const proposalMap = new Map<
    string,
    {
      id: string;
      code: string;
      name: string | null;
      currency: string;
      totalMonthly: number;
      installations: QuoteRow[];
    }
  >();
  for (const row of data) {
    if (!row.proposalId) continue;
    const member = memberByQuoteId.get(row.id);
    if (!member) continue;
    let group = proposalMap.get(row.proposalId);
    if (!group) {
      group = {
        id: member.bundle.id,
        code: member.bundle.code,
        name: member.bundle.name,
        currency: member.bundle.currency,
        totalMonthly: 0,
        installations: [],
      };
      proposalMap.set(row.proposalId, group);
    }
    group.installations.push(row);
    // El total sólo suma instalaciones incluidas en la propuesta.
    if (member.includedInProposal) {
      group.totalMonthly += row.monthlyCost;
    }
  }
  const proposals = Array.from(proposalMap.values()).map((p) => ({
    ...p,
    installations: p.installations.sort((a, b) => {
      const ma = memberByQuoteId.get(a.id)?.displayOrder ?? 0;
      const mb = memberByQuoteId.get(b.id)?.displayOrder ?? 0;
      return ma - mb;
    }),
  }));

  return NextResponse.json({ success: true, data, proposals });
}
