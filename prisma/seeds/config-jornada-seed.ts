/**
 * Seed: Configuración de jornada laboral (Ley 21.561)
 * Crea las configuraciones de transición 44h → 42h
 */

import { PrismaClient } from "@prisma/client";

export async function seedConfigJornada(
  prisma: PrismaClient,
  tenantId: string
) {
  const existing = await prisma.configJornada.findFirst({
    where: { tenantId },
  });
  if (existing) {
    console.log("  ⏭️  ConfigJornada ya existe, saltando");
    return;
  }

  await prisma.configJornada.createMany({
    data: [
      {
        tenantId,
        maxHorasSemanales: 44,
        maxHorasDiarias: 12,
        maxHorasExtras: 2,
        vigenciaDesde: new Date("2024-04-26T00:00:00Z"),
        vigenciaHasta: new Date("2026-04-25T23:59:59Z"),
        leyReferencia: "Ley 21.561 transitorio (primer tramo)",
      },
      {
        tenantId,
        maxHorasSemanales: 42,
        maxHorasDiarias: 12,
        maxHorasExtras: 2,
        vigenciaDesde: new Date("2026-04-26T00:00:00Z"),
        vigenciaHasta: null,
        leyReferencia: "Ley 21.561 segundo tramo (42h definitivo)",
      },
    ],
  });

  console.log("  ✅ ConfigJornada seed: 44h (hasta 25/04/2026) + 42h (desde 26/04/2026)");
}
