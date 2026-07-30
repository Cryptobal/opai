/**
 * PAYROLL INITIAL SEED DATA
 * Parámetros legales Chile 2026 (Julio + Agosto en adelante) + UF/UTM
 *
 * Versión activa para cotizar: Agosto 2026 en adelante (reforma 3,5%).
 * Julio 2026 queda para lookup por fecha (liquidaciones / cashflow julio).
 */

import { PrismaClient } from "@prisma/client";
import {
  AUGUST_2026_VERSION_NAME,
  JULY_2026_VERSION_NAME,
  buildAugust2026Parameters,
  buildJuly2026Parameters,
} from "./payroll-params-chile-2026";

const prisma = new PrismaClient();

async function upsertParamVersion(opts: {
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
    await prisma.payrollParameterVersion.update({
      where: { id: existing.id },
      data: {
        description: opts.description,
        effectiveFrom: opts.effectiveFrom,
        effectiveUntil: opts.effectiveUntil,
        data: opts.data as object,
        isActive: opts.isActive,
      },
    });
    console.log(`   ↻ Updated: ${opts.name} (isActive=${opts.isActive})`);
    return;
  }

  await prisma.payrollParameterVersion.create({
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
  console.log(`   + Created: ${opts.name} (isActive=${opts.isActive})`);
}

export async function seedPayrollData() {
  console.log("🌱 Seeding Payroll data...");

  // 1. Crear tabla FX: UF Rates (referencia)
  console.log("   → Creating UF rates...");
  await prisma.fxUfRate.upsert({
    where: { date: new Date("2026-02-01") },
    update: {},
    create: {
      date: new Date("2026-02-01"),
      value: 39703.5,
      source: "SBIF",
      fetchedAt: new Date(),
    },
  });

  // 2. Crear tabla FX: UTM Rates
  console.log("   → Creating UTM rates...");
  await prisma.fxUtmRate.upsert({
    where: { month: new Date("2026-02-01") },
    update: {},
    create: {
      month: new Date("2026-02-01"),
      value: 69611,
      source: "SII",
      fetchedAt: new Date(),
    },
  });

  // 3. Crear assumptions por defecto
  console.log("   → Creating default assumptions...");
  const existingAssumption = await prisma.payrollAssumption.findFirst({
    where: { isDefault: true },
  });

  if (!existingAssumption) {
    await prisma.payrollAssumption.create({
      data: {
        name: "Assumptions Por Defecto Chile",
        description: "Provisiones estándar para costeo empleador",
        vacationProvisionPct: 0.0833,
        severanceProvisionPct: 0.0,
        holidayBonusPct: 0.0,
        christmasBonusPct: 0.0,
        workInjuryRiskLevel: "security_industry",
        isDefault: true,
      },
    });
  }

  // 4. Versiones de parámetros legales 2026
  console.log("   → Creating/updating parameter versions 2026...");

  // Desactivar activas previas (solo una activa al final)
  await prisma.payrollParameterVersion.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Histórica Feb 2026: conservar si existe, fix fecha 29-feb (2026 no bisiesto)
  const febExisting = await prisma.payrollParameterVersion.findFirst({
    where: { name: "Parámetros Legales Chile - Febrero 2026" },
  });
  if (febExisting) {
    const until = febExisting.effectiveUntil;
    const needsFix =
      until != null && until.getUTCMonth() === 1 && until.getUTCDate() === 29;
    await prisma.payrollParameterVersion.update({
      where: { id: febExisting.id },
      data: {
        isActive: false,
        ...(needsFix ? { effectiveUntil: new Date("2026-02-28") } : {}),
      },
    });
    if (needsFix) {
      console.log("   🔧 Fixed Febrero 2026 effectiveUntil → 2026-02-28");
    }
  }

  await upsertParamVersion({
    name: JULY_2026_VERSION_NAME,
    description:
      "SIS 2,00% + reforma previsional 1,0% (Ley 21.735). Vigente solo julio 2026.",
    effectiveFrom: new Date("2026-07-01"),
    effectiveUntil: new Date("2026-07-31"),
    data: buildJuly2026Parameters(),
    isActive: false,
  });

  await upsertParamVersion({
    name: AUGUST_2026_VERSION_NAME,
    description:
      "Reforma previsional 3,5% (incluye SIS). Topes 90/135,2 UF, IMM $553.553. Versión activa para cotizar.",
    effectiveFrom: new Date("2026-08-01"),
    effectiveUntil: null,
    data: buildAugust2026Parameters(),
    isActive: true,
  });

  console.log("✅ Payroll data seeded successfully!");
}

export default seedPayrollData;
