/**
 * Script para depurar la búsqueda de cotizaciones por nombre de negocio.
 * Ejecutar: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/debug-search-quotes.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) {
    console.error("No se encontró tenant 'gard'");
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log("Tenant ID:", tenantId);

  const queries = ["ametel", "algarrobo", "Ametel"];
  const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

  for (const q of queries) {
    console.log("\n" + "=".repeat(60));
    console.log("BÚSQUEDA:", JSON.stringify(q));
    console.log("=".repeat(60));

    const c = contains(q);

    // 1. Deals por título
    const dealsByTitle = await prisma.crmDeal.findMany({
      where: { tenantId, title: c },
      select: { id: true, title: true, accountId: true },
    });
    console.log("\n1. Deals por título:", dealsByTitle.length);
    dealsByTitle.forEach((d) => console.log("   -", d.id, "|", d.title));

    // 2. Deals por nombre de cuenta
    const dealsByAccount = await prisma.crmDeal.findMany({
      where: { tenantId, account: { name: c } },
      select: { id: true, title: true, account: { select: { name: true } } },
    });
    console.log("\n2. Deals por nombre de cuenta:", dealsByAccount.length);
    dealsByAccount.forEach((d) =>
      console.log("   -", d.id, "|", d.title, "| cuenta:", d.account?.name)
    );

    // 3. Deals combinados (título O cuenta)
    const dealIdsByTitleOrAccount = await prisma.crmDeal.findMany({
      where: {
        tenantId,
        OR: [{ title: c }, { account: { name: c } }],
      },
      select: { id: true, title: true, account: { select: { name: true } } },
    });
    const dealIdsForQuotes = dealIdsByTitleOrAccount.map((d) => d.id);
    console.log("\n3. Deal IDs para cotizaciones:", dealIdsForQuotes.length, dealIdsForQuotes);

    // 4. CrmDealQuote (enlaces deal-quote)
    const dealQuoteLinks =
      dealIdsForQuotes.length > 0
        ? await prisma.crmDealQuote.findMany({
            where: { tenantId, dealId: { in: dealIdsForQuotes } },
            select: { quoteId: true, dealId: true },
          })
        : [];
    const quoteIdsFromDealLinks = dealQuoteLinks.map((r) => r.quoteId);
    console.log("\n4. Cotizaciones en CrmDealQuote:", quoteIdsFromDealLinks.length);
    dealQuoteLinks.forEach((l) => console.log("   - quoteId:", l.quoteId, "| dealId:", l.dealId));

    // 5. CpqQuote con dealId directo
    const quotesByDealId =
      dealIdsForQuotes.length > 0
        ? await prisma.cpqQuote.findMany({
            where: { tenantId, dealId: { in: dealIdsForQuotes } },
            select: { id: true, code: true, clientName: true, dealId: true },
          })
        : [];
    console.log("\n5. Cotizaciones con dealId directo:", quotesByDealId.length);
    quotesByDealId.forEach((q) =>
      console.log("   -", q.code, "| dealId:", q.dealId, "| client:", q.clientName)
    );

    // 6. CpqQuote por código o clientName
    const quotesByCodeOrClient = await prisma.cpqQuote.findMany({
      where: {
        tenantId,
        OR: [{ code: c }, { clientName: c }],
      },
      select: { id: true, code: true, clientName: true, dealId: true },
    });
    console.log("\n6. Cotizaciones por código/clientName:", quotesByCodeOrClient.length);
    quotesByCodeOrClient.forEach((q) =>
      console.log("   -", q.code, "| dealId:", q.dealId, "| client:", q.clientName)
    );

    // 7. Todas las cotizaciones del tenant (para ver CPQ-2026-020)
    const allQuotesWithAmetel = await prisma.cpqQuote.findMany({
      where: { tenantId },
      select: { id: true, code: true, clientName: true, dealId: true },
      take: 30,
      orderBy: { createdAt: "desc" },
    });
    const cpq020 = allQuotesWithAmetel.find((q) => q.code === "CPQ-2026-020");
    if (cpq020) {
      console.log("\n7. Cotización CPQ-2026-020 encontrada:");
      console.log("   - id:", cpq020.id);
      console.log("   - dealId:", cpq020.dealId);
      console.log("   - clientName:", cpq020.clientName);

      if (cpq020.dealId) {
        const deal = await prisma.crmDeal.findUnique({
          where: { id: cpq020.dealId },
          select: { id: true, title: true, account: { select: { name: true } } },
        });
        console.log("   - Deal asociado:", deal?.title, "| Cuenta:", deal?.account?.name);
      }

      const link = await prisma.crmDealQuote.findFirst({
        where: { quoteId: cpq020.id },
        select: { dealId: true },
      });
      console.log("   - En CrmDealQuote:", link ? `dealId=${link.dealId}` : "NO");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
