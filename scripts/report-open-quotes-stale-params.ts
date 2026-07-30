/**
 * Lista cotizaciones en estados abiertos cuyo payrollVersionId difiere
 * de la versión activa de parámetros. Solo lectura — no escribe.
 *
 * Uso:
 *   npx tsx scripts/report-open-quotes-stale-params.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Estados abiertos / editables: borradores y enviadas aún no aceptadas.
 * Aceptadas/ganadas/perdidas/archivadas se excluyen (snapshot inmutable).
 */
const CLOSED_STATUSES = new Set([
  "accepted",
  "APPROVED",
  "approved",
  "won",
  "WON",
  "lost",
  "LOST",
  "rejected",
  "REJECTED",
  "archived",
  "ARCHIVED",
  "cancelled",
  "CANCELLED",
  "void",
  "VOID",
]);

async function main() {
  const active = await prisma.payrollParameterVersion.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (!active) {
    console.error("No hay versión activa de parámetros.");
    process.exitCode = 1;
    return;
  }

  console.log(`Versión activa: ${active.name} (${active.id})\n`);

  const statusValues = await prisma.cpqQuote.findMany({
    select: { status: true },
    distinct: ["status"],
  });
  console.log(
    "Statuses presentes en BD:",
    statusValues.map((s) => s.status).join(", ") || "(ninguno)"
  );

  const allQuotes = await prisma.cpqQuote.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      tenantId: true,
      updatedAt: true,
      positions: {
        select: {
          id: true,
          payrollVersionId: true,
          employerCost: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const openQuotes = allQuotes.filter((q) => !CLOSED_STATUSES.has(q.status));

  type StaleRow = {
    quoteId: string;
    code: string;
    status: string;
    tenantId: string;
    stalePositions: number;
    totalPositions: number;
    versionIds: string[];
  };

  const stale: StaleRow[] = [];

  for (const q of openQuotes) {
    const versionIds = new Set<string>();
    let stalePositions = 0;
    for (const p of q.positions) {
      if (p.payrollVersionId) {
        versionIds.add(p.payrollVersionId);
        if (p.payrollVersionId !== active.id) stalePositions += 1;
      } else if (q.positions.length > 0) {
        stalePositions += 1;
      }
    }
    if (stalePositions > 0) {
      stale.push({
        quoteId: q.id,
        code: q.code,
        status: q.status,
        tenantId: q.tenantId,
        stalePositions,
        totalPositions: q.positions.length,
        versionIds: [...versionIds],
      });
    }
  }

  console.log(`\nCotizaciones abiertas con params antiguos: ${stale.length}`);
  console.log(`(de ${openQuotes.length} cotizaciones en estados abiertos)\n`);

  for (const row of stale.slice(0, 100)) {
    console.log(
      [
        row.code,
        `status=${row.status}`,
        `tenant=${row.tenantId}`,
        `stale=${row.stalePositions}/${row.totalPositions}`,
        `versions=${row.versionIds.join("|") || "(null)"}`,
      ].join(" | ")
    );
  }

  if (stale.length > 100) {
    console.log(`... y ${stale.length - 100} más`);
  }

  console.log(
    JSON.stringify(
      {
        activeVersionId: active.id,
        activeVersionName: active.name,
        openQuotesScanned: openQuotes.length,
        staleQuotes: stale.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error("❌ report-open-quotes-stale-params failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
