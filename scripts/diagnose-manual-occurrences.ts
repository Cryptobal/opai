/**
 * Diagnóstico READ-ONLY de occurrences manuales en estado potencialmente
 * inconsistente. No modifica nada.
 *
 * Uso:
 *   vercel env pull .env.production.local
 *   DATABASE_URL="$(grep DATABASE_URL .env.production.local | cut -d= -f2-)" \
 *     npx tsx scripts/diagnose-manual-occurrences.ts <TENANT_ID>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error(
      "Uso: npx tsx scripts/diagnose-manual-occurrences.ts <TENANT_ID>",
    );
    process.exit(1);
  }

  const manualOccs = await prisma.financeCashflowOccurrence.findMany({
    where: { tenantId, item: { source: "MANUAL" } },
    select: {
      id: true,
      scheduledDate: true,
      amountClp: true,
      status: true,
      dteId: true,
      bankTransactionId: true,
      isClosingAdjust: true,
      item: {
        select: {
          id: true,
          name: true,
          recurrence: true,
          isActive: true,
          startDate: true,
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  console.log(
    `\n=== ${manualOccs.length} occurrences MANUAL para tenant ${tenantId} ===\n`,
  );

  const sospechosas = manualOccs.filter(
    (o) => o.status === "PAID" && !o.bankTransactionId,
  );

  for (const o of manualOccs) {
    const flags: string[] = [];
    if (o.status === "PAID" && !o.bankTransactionId) flags.push("PAID-sin-banktx");
    if (o.bankTransactionId) flags.push("conciliada");
    if (o.dteId) flags.push("con-DTE");
    if (o.isClosingAdjust) flags.push("ajuste-cierre");
    if (!o.item?.isActive) flags.push("item-inactivo");
    console.log(
      `  [${o.scheduledDate.toISOString().slice(0, 10)}] "${o.item?.name}" ` +
        `$${o.amountClp.toLocaleString("es-CL")} · ${o.status} · ` +
        `occ=${o.id.slice(0, 8)} item=${o.item?.id.slice(0, 8)} ` +
        `${flags.length ? "→ " + flags.join(", ") : ""}`,
    );
  }

  console.log(
    `\n=== ${sospechosas.length} sospechosas (PAID sin bank tx) ===`,
  );
  for (const o of sospechosas) {
    console.log(
      `  occ=${o.id} "${o.item?.name}" $${o.amountClp.toLocaleString("es-CL")}`,
    );
  }
  if (sospechosas.length > 0) {
    console.log(
      "\nNO borres a ciegas. Si son basura de prueba, armamos un cleanup con --confirm.",
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
