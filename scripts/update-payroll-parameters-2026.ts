/**
 * Inserta versiones de parámetros legales Julio 2026 y Agosto 2026 en adelante,
 * y activa Agosto como versión vigente para cotizar.
 *
 * Idempotente por nombre: si ya existen, actualiza `data` / fechas / flags
 * sin borrar versiones históricas.
 *
 * Uso:
 *   npx tsx scripts/update-payroll-parameters-2026.ts
 *
 * NO ejecutar contra producción sin instrucción explícita de Carlos.
 */

import { PrismaClient } from "@prisma/client";
import {
  AUGUST_2026_VERSION_NAME,
  JULY_2026_VERSION_NAME,
  buildAugust2026Parameters,
  buildJuly2026Parameters,
} from "../prisma/seeds/payroll-params-chile-2026";

const prisma = new PrismaClient();

async function upsertVersion(opts: {
  name: string;
  description: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  data: unknown;
  isActive: boolean;
}) {
  const existing = await prisma.payrollParameterVersion.findFirst({
    where: { name: opts.name },
  });

  if (existing) {
    const updated = await prisma.payrollParameterVersion.update({
      where: { id: existing.id },
      data: {
        description: opts.description,
        effectiveFrom: opts.effectiveFrom,
        effectiveUntil: opts.effectiveUntil,
        data: opts.data as object,
        isActive: opts.isActive,
      },
    });
    console.log(`   ↻ Updated: ${opts.name} (${updated.id}) isActive=${opts.isActive}`);
    return updated;
  }

  const created = await prisma.payrollParameterVersion.create({
    data: {
      name: opts.name,
      description: opts.description,
      effectiveFrom: opts.effectiveFrom,
      effectiveUntil: opts.effectiveUntil,
      data: opts.data as object,
      isActive: opts.isActive,
      createdBy: "system",
    },
  });
  console.log(`   + Created: ${opts.name} (${created.id}) isActive=${opts.isActive}`);
  return created;
}

async function main() {
  console.log("📋 Active parameter version BEFORE update:");
  const before = await prisma.payrollParameterVersion.findFirst({
    where: { isActive: true },
  });
  if (before) {
    const data = before.data as Record<string, unknown>;
    const sis = data.sis as { employer_rate?: number } | undefined;
    const caps = data.caps as { pension_uf?: number; afc_uf?: number } | undefined;
    const imm = data.imm as { value_clp?: number } | undefined;
    const reform = data.pension_reform as { employer_rate?: number } | undefined;
    console.log(
      JSON.stringify(
        {
          id: before.id,
          name: before.name,
          effectiveFrom: before.effectiveFrom,
          effectiveUntil: before.effectiveUntil,
          sis_rate: sis?.employer_rate ?? null,
          pension_reform_rate: reform?.employer_rate ?? null,
          pension_uf: caps?.pension_uf ?? null,
          afc_uf: caps?.afc_uf ?? null,
          imm_clp: imm?.value_clp ?? null,
        },
        null,
        2
      )
    );
  } else {
    console.log("   (none)");
  }

  // Desactivar todas las versiones activas antes de flip (solo una activa)
  await prisma.payrollParameterVersion.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  console.log("\n🌱 Upserting Julio 2026 (lookup por fecha / liquidaciones)...");
  await upsertVersion({
    name: JULY_2026_VERSION_NAME,
    description:
      "SIS 2,00% + reforma previsional 1,0% (Ley 21.735). Vigente solo julio 2026.",
    effectiveFrom: new Date("2026-07-01"),
    effectiveUntil: new Date("2026-07-31"),
    data: buildJuly2026Parameters(),
    isActive: false,
  });

  console.log("\n🌱 Upserting Agosto 2026 en adelante (activa para cotizar)...");
  await upsertVersion({
    name: AUGUST_2026_VERSION_NAME,
    description:
      "Reforma previsional 3,5% (incluye SIS). Topes 90/135,2 UF, IMM $553.553. Versión activa para cotizar.",
    effectiveFrom: new Date("2026-08-01"),
    effectiveUntil: null,
    data: buildAugust2026Parameters(),
    isActive: true,
  });

  // Fix fecha inválida Feb 29 en versión histórica si existe
  const feb = await prisma.payrollParameterVersion.findFirst({
    where: { name: "Parámetros Legales Chile - Febrero 2026" },
  });
  if (feb && feb.effectiveUntil) {
    const d = feb.effectiveUntil;
    if (d.getUTCMonth() === 1 && d.getUTCDate() === 29) {
      await prisma.payrollParameterVersion.update({
        where: { id: feb.id },
        data: { effectiveUntil: new Date("2026-02-28") },
      });
      console.log("\n🔧 Fixed Febrero 2026 effectiveUntil: 2026-02-29 → 2026-02-28");
    }
  }

  console.log("\n✅ Active parameter version AFTER update:");
  const after = await prisma.payrollParameterVersion.findFirst({
    where: { isActive: true },
  });
  if (after) {
    const data = after.data as Record<string, unknown>;
    const sis = data.sis as { employer_rate?: number } | undefined;
    const reform = data.pension_reform as {
      employer_rate?: number;
      includes_sis?: boolean;
    } | undefined;
    console.log(
      JSON.stringify(
        {
          id: after.id,
          name: after.name,
          sis_rate: sis?.employer_rate ?? null,
          pension_reform_rate: reform?.employer_rate ?? null,
          includes_sis: reform?.includes_sis ?? null,
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((err) => {
    console.error("❌ update-payroll-parameters-2026 failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
