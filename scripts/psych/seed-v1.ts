/**
 * Seed idempotente del test "security-guard-v1.0.0".
 *
 * Uso:
 *   npx tsx scripts/psych/seed-v1.ts
 *
 * Hace upsert de PsychTestVersion (code=security-guard-v1, version=1.0.0)
 * y re-inserta los 45 items (borra items previos de esa versión primero).
 */

import { PrismaClient, type PsychItemType } from "@prisma/client";
import {
  PSYCH_TEST_CODE,
  PSYCH_TEST_VERSION,
} from "@/lib/psych/constants";
import { ITEMS_V1 } from "./seed-data/v1-items";

const prisma = new PrismaClient();

async function main() {
  console.log(
    `[psych-seed] Seeding ${PSYCH_TEST_CODE}@${PSYCH_TEST_VERSION} (${ITEMS_V1.length} items)`,
  );

  const version = await prisma.psychTestVersion.upsert({
    where: {
      code_version: { code: PSYCH_TEST_CODE, version: PSYCH_TEST_VERSION },
    },
    create: {
      code: PSYCH_TEST_CODE,
      version: PSYCH_TEST_VERSION,
      name: "Test psicolaboral — Guardia de Seguridad v1",
      description:
        "MVP para screening interno de aptitud psicolaboral de guardias. No sustituye el informe OS-10.",
      isActive: true,
    },
    update: {
      name: "Test psicolaboral — Guardia de Seguridad v1",
      isActive: true,
    },
  });
  console.log(`[psych-seed] ✔ upsert version id=${version.id}`);

  const deleted = await prisma.psychItem.deleteMany({
    where: { versionId: version.id },
  });
  console.log(`[psych-seed] deleted ${deleted.count} items previos`);

  let created = 0;
  for (const item of ITEMS_V1) {
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
