/**
 * Previred File Exporter
 * Generates semicolon-delimited CSV for Previred upload.
 * Format based on "Libro Imposiciones Centralizado 2026.csv"
 *
 * Key fields (90+ columns): RUT;DV;Ap.Paterno;Ap.Materno;Nombres;Sexo;...
 * AFP codes, days, salary, AFP amount, health, AFC, etc.
 */

import { prisma } from "@/lib/prisma";

const AFP_CODES: Record<string, number> = {
  Capital: 0,
  Cuprum: 1,
  Habitat: 2,
  PlanVital: 3,
  ProVida: 4,
  Modelo: 5,
  Uno: 8,
  IPS: 11,
};

export async function generatePreviredFile(
  periodId: string,
  tenantId: string,
  installationId?: string
): Promise<string> {
  const where: any = { periodId, tenantId };
  if (installationId) where.installationId = installationId;

  const liquidaciones = await prisma.payrollLiquidacion.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  const guardIds = [...new Set(liquidaciones.map((l) => l.guardiaId))];
  const guardias = await prisma.opsGuardia.findMany({
    where: { id: { in: guardIds } },
    select: {
      id: true,
      contractType: true,
      persona: {
        select: {
          rut: true,
          firstName: true,
          lastName: true,
          sex: true,
          afp: true,
          healthSystem: true,
        },
      },
    },
  });
  const guardMap = new Map(guardias.map((g) => [g.id, g]));

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  const periodCode = period ? `${String(period.month).padStart(2, "0")}${period.year}` : "";

  const rows: string[] = [];

  for (const liq of liquidaciones) {
    const guard = guardMap.get(liq.guardiaId);
    if (!guard) continue;

    const bd = liq.breakdown as any;
    const hab = bd?.haberes || {};
    const ded = bd?.deductions || {};

    const rut = guard.persona.rut || "";
    const rutParts = rut.replace(/\./g, "").split("-");
    const rutNum = rutParts[0] || "";
    const rutDv = rutParts[1] || "";

    const nameParts = (guard.persona.lastName || "").split(" ");
    const apPaterno = nameParts[0] || "";
    const apMaterno = nameParts.slice(1).join(" ") || "";
    const nombres = guard.persona.firstName || "";
    const sex = guard.persona.sex === "F" ? "F" : "M";

    const afpCode = AFP_CODES[guard.persona.afp || "Modelo"] ?? 5;
    const contractCode = guard.contractType === "plazo_fijo" ? "A" : "D";

    const totalImponible = hab.total_taxable || 0;
    const afpAmount = ded.afp?.amount || 0;
    const healthAmount = ded.health?.amount || 0;
    const afcAmount = ded.afc?.amount || 0;

    // Build the ~90 field row (simplified - key fields populated)
    const fields: (string | number)[] = [
      rutNum, // RUT
      rutDv, // DV
      apPaterno,
      apMaterno,
      nombres,
      sex,
      0, // Nacionalidad
      "01", // Tipo trabajador
      periodCode, // Periodo desde
      periodCode, // Periodo hasta
      "AFP", // Régimen previsional
      afpCode, // Código AFP
      liq.daysWorked, // Días trabajados
      "00", // Tipo línea
      0, // Código movimiento personal
      "", // Fecha desde mov
      "", // Fecha hasta mov
      contractCode, // Tipo contrato
      // ... campos adicionales con valores por defecto
      0, 0, 0, 0, 0, 0, // Campos varios
      "N", // AFC
      ...Array(9).fill(0), // Health related
      "", "", "", // More fields
      0, 0, 0, // More fields
      "", // More
      0, 0, 0, 0, // More
      "", // More
      0, 0, 0, 0, // More
      "", "", "", "", "", 0, "", "", "", // More
      0, 0, 0, 0, 0, 0, // More
      totalImponible, // Renta imponible
      0, 0, 0, 0, 0,
      afpAmount, // AFP cotización
      0, 0, 0, 0,
      7, // Código Fonasa/Isapre
      0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      1, // Código mutual
      0, 0,
      1, // Sucursal
      totalImponible, // Renta tributable
      Math.round(totalImponible * 0.0093), // SIS
      123, // Código CCAF placeholder
      totalImponible, // AFC base
      afcAmount, // AFC trabajador
      afcAmount * 4, // AFC empleador aprox
      0, // Más campos
      "", // Fin
    ];

    rows.push(fields.join(";"));
  }

  return rows.join("\n");
}
