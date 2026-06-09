/**
 * Diagnóstico read-only del polling de estado SII.
 *
 * Llama provider.getStatus() (mismo path que el cron) para algunos
 * DTEs atascados en PENDING y muestra la respuesta cruda de
 * SimpleAPI consulta/envio. NO escribe en la base de datos.
 *
 * Uso:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/diagnose-sii-status.ts
 */
import { prisma } from "../src/lib/prisma";
import { getDteProvider } from "../src/modules/finance/shared/adapters/dte-provider.adapter";

async function main() {
  const dtes = await prisma.financeDte.findMany({
    where: {
      direction: "ISSUED",
      siiStatus: { in: ["PENDING", "SENT"] },
      siiTrackId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      folio: true,
      dteType: true,
      date: true,
      siiStatus: true,
      siiTrackId: true,
      siiStatusCheckCount: true,
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  if (dtes.length === 0) {
    console.log("No hay DTEs PENDING/SENT con trackId.");
    return;
  }

  const provider = await getDteProvider(dtes[0].tenantId);
  console.log(`Provider: ${provider.constructor.name}\n`);

  for (const dte of dtes) {
    console.log(
      `── DTE ${dte.dteType}-${dte.folio} (${dte.date?.toISOString().slice(0, 10)}) ` +
        `status=${dte.siiStatus} checks=${dte.siiStatusCheckCount} trackId=${dte.siiTrackId}`,
    );
    try {
      const status = await provider.getStatus(dte.siiTrackId!);
      console.log("  → status mapeado:", status.status);
      console.log("  → message (Estado crudo):", JSON.stringify(status.message));
      console.log(
        "  → rawResponse:",
        JSON.stringify(status.rawResponse).slice(0, 1500),
      );
    } catch (err) {
      console.log("  → ERROR:", err instanceof Error ? err.message : String(err));
    }
    console.log();
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
