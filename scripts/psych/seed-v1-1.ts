/**
 * Seed idempotente del test "security-guard-v1@1.1.0".
 *
 * Uso:
 *   npx tsx scripts/psych/seed-v1-1.ts
 *
 * No toca v1.0.0 — crea/actualiza versión 1.1.0 con 49 items.
 */

import { PrismaClient, type PsychItemType } from "@prisma/client";
import { PSYCH_TEST_CODE } from "@/lib/psych/constants";
import { ITEMS_V1_1 } from "./seed-data/v1-1-items";

const VERSION = "1.1.0";
const prisma = new PrismaClient();

async function main() {
  console.log(
    `[psych-seed] Seeding ${PSYCH_TEST_CODE}@${VERSION} (${ITEMS_V1_1.length} items)`,
  );

  const version = await prisma.psychTestVersion.upsert({
    where: { code_version: { code: PSYCH_TEST_CODE, version: VERSION } },
    create: {
      code: PSYCH_TEST_CODE,
      version: VERSION,
      name: "Test psicolaboral — Guardia de Seguridad v1.1",
      description:
        "v1.1: agrega dimensión VOCATIONAL_FIT (Pasión por la seguridad), corrige cobertura y escala LIE asimétrica.",
      isActive: true,
    },
    update: {
      name: "Test psicolaboral — Guardia de Seguridad v1.1",
      isActive: true,
    },
  });
  console.log(`[psych-seed] ✔ upsert version id=${version.id}`);

  const deleted = await prisma.psychItem.deleteMany({
    where: { versionId: version.id },
  });
  console.log(`[psych-seed] deleted ${deleted.count} items previos`);

  let created = 0;
  for (const item of ITEMS_V1_1) {
    await prisma.psychItem.create({
      data: {
        versionId: version.id,
        order: item.order,
        type: item.type as PsychItemType,
        dimension: item.dimension,
        prompt: item.prompt,
        options: item.options as never,
        scoringKey: item.scoringKey as never,
        reverseScore: item.reverseScore ?? false,
        weight: item.weight ?? 1.0,
        minLatencyMs: item.minLatencyMs ?? 800,
        maxLatencyMs: item.maxLatencyMs ?? 120_000,
      },
    });
    created += 1;
  }
  console.log(`[psych-seed] ✔ ${created} items insertados`);
}

main()
  .catch((err) => {
    console.error("[psych-seed] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
