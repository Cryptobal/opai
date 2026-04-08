/**
 * Limpieza one-time de marcacionPinVisible (Ley 21.719 — Fase 3 parcial).
 *
 * CONTEXTO:
 *   Hasta la Fase 2 el PIN de marcación se almacenaba en claro en la columna
 *   `marcacion_pin_visible` para que el admin lo pudiera consultar en la ficha
 *   del guardia. Con la Fase 3 parcial se dejó de ESCRIBIR ese campo: ahora
 *   el PIN solo existe hasheado (`marcacionPin`) y se devuelve UNA vez en la
 *   respuesta del endpoint de regeneración.
 *
 *   Este script limpia los PINs en claro que quedaron de la vida anterior:
 *       UPDATE ops."OpsGuardia" SET marcacion_pin_visible = NULL
 *       WHERE marcacion_pin_visible IS NOT NULL;
 *
 * CUÁNDO EJECUTAR:
 *   - DESPUÉS del primer deploy que contenga el cambio "deja de escribir
 *     marcacionPinVisible" (Fase 3 parcial). Si lo corres antes, los admins
 *     perderán los PINs visibles y el código volverá a escribirlos en la
 *     siguiente regeneración.
 *   - No se elimina la columna del schema — esa migración DROP COLUMN queda
 *     para una Fase 3 posterior, una vez confirmado que no hay lectores.
 *
 * CÓMO EJECUTAR:
 *   npx tsx scripts/clear-marcacion-pin-visible.ts
 *
 * IDEMPOTENCIA:
 *   El UPDATE es seguro de re-ejecutar: si no quedan PINs en claro, actualiza
 *   0 filas.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const pending = await prisma.opsGuardia.count({
    where: { marcacionPinVisible: { not: null } },
  });

  if (pending === 0) {
    console.log("✓ No hay PINs visibles que limpiar. Nada que hacer.");
    return;
  }

  console.log(`▶ Limpiando ${pending} PIN(s) visibles en OpsGuardia...`);

  const result = await prisma.opsGuardia.updateMany({
    where: { marcacionPinVisible: { not: null } },
    data: { marcacionPinVisible: null },
  });

  console.log(`✓ PINs visibles eliminados: ${result.count}`);
  console.log("  Los hashes (marcacionPin) no fueron modificados.");
}

main()
  .catch((err) => {
    console.error("✗ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
