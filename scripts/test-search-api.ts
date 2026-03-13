/**
 * Test que simula la lógica completa de /api/search/global para "ametel"
 * Ejecutar: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/test-search-api.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CRM_TYPE_LIMIT = 4;
const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) {
    console.error("No tenant gard");
    process.exit(1);
  }
  const tenantId = tenant.id;
  const q = "ametel";
  const c = contains(q);

  console.log("Simulando GET /api/search/global?q=ametel");
  console.log("tenantId:", tenantId);

  // Misma lógica que la API
  const dealIdsByTitleOrAccount = await prisma.crmDeal.findMany({
    where: {
      tenantId,
      OR: [{ title: c }, { account: { name: c } }],
    },
    select: { id: true },
  });
  const dealIdsForQuotes = dealIdsByTitleOrAccount.map((d) => d.id);

  const dealQuoteLinks =
    dealIdsForQuotes.length > 0
      ? await prisma.crmDealQuote.findMany({
          where: { tenantId, dealId: { in: dealIdsForQuotes } },
          select: { quoteId: true, dealId: true },
        })
      : [];
  const quoteIdsFromDealLinks = dealQuoteLinks.map((r) => r.quoteId);

  const quotes = await prisma.cpqQuote.findMany({
    where: {
      tenantId,
      OR: [
        { code: c },
        { clientName: c },
        { notes: c },
        ...(dealIdsForQuotes.length > 0 ? [{ dealId: { in: dealIdsForQuotes } }] : []),
        ...(quoteIdsFromDealLinks.length > 0 ? [{ id: { in: quoteIdsFromDealLinks } }] : []),
      ],
    },
    take: CRM_TYPE_LIMIT,
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, clientName: true, status: true, dealId: true },
  });

  console.log("\n--- RESULTADO: cotizaciones encontradas ---");
  console.log("dealIdsForQuotes:", dealIdsForQuotes.length);
  console.log("quoteIdsFromDealLinks:", quoteIdsFromDealLinks.length);
  console.log("quotes encontradas:", quotes.length);
  quotes.forEach((q) => console.log("  -", q.code, "| dealId:", q.dealId));

  if (quotes.length === 0) {
    console.log("\n❌ ERROR: No se encontraron cotizaciones. Debería aparecer CPQ-2026-020.");
  } else {
    const cpq020 = quotes.find((q) => q.code === "CPQ-2026-020");
    if (cpq020) {
      console.log("\n✅ OK: CPQ-2026-020 (Ametel - Algarrobo) SÍ está en los resultados.");
    } else {
      console.log("\n⚠️ CPQ-2026-020 no está en la lista (puede ser por límite CRM_TYPE_LIMIT=4)");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
