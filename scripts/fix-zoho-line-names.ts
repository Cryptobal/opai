/**
 * Limpia FinanceDteLine.itemName cuando vino como "Carlos Irigoyen Garcés"
 * (el sales person de Zoho cuando Item Name venía vacío). Usa la primera
 * línea del description como nombre, truncada a 80 chars. Fallback:
 * "Servicio de Seguridad".
 *
 * Uso:
 *   npx tsx scripts/fix-zoho-line-names.ts            # dry-run
 *   npx tsx scripts/fix-zoho-line-names.ts --apply    # ejecuta
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const BAD_NAMES = new Set([
  "Carlos Irigoyen Garcés",
  "Carlos Irigoyen Garces", // por si hay variantes sin tilde
]);

function deriveItemName(description: string | null): string {
  if (!description?.trim()) return "Servicio de Seguridad";
  const first = description.split("\n")[0].trim();
  if (!first) return "Servicio de Seguridad";
  return first.slice(0, 80);
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  if (!tenant) throw new Error("tenant gard no encontrado");

  const bad = await prisma.financeDteLine.findMany({
    where: {
      itemName: { in: [...BAD_NAMES] },
      dte: { tenantId: tenant.id },
    },
    select: { id: true, description: true, itemName: true },
  });

  console.log(`Líneas con nombre malo: ${bad.length}`);
  const changes = bad.map((l) => ({ id: l.id, from: l.itemName, to: deriveItemName(l.description) }));

  // breakdown de "to"
  const byTo = new Map<string, number>();
  for (const c of changes) byTo.set(c.to, (byTo.get(c.to) ?? 0) + 1);
  console.log("Distribución de nuevo nombre:");
  [...byTo].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n}\t${k}`));

  if (!APPLY) {
    console.log("\n[DRY-RUN] No se escribió nada. Usar --apply.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const c of changes) {
    await prisma.financeDteLine.update({ where: { id: c.id }, data: { itemName: c.to } });
    updated++;
  }
  console.log(`Actualizadas: ${updated}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
