/**
 * scripts/cleanup-rut-invisible.ts
 *
 * Higiene de datos (OPCIONAL, GATED). Normaliza en la DB los RUT del tenant
 * indicado que contengan caracteres FUERA de `[0-9kK.-]` — típicamente
 * caracteres invisibles del XML SII (zero-width space U+200B, BOM U+FEFF,
 * marcas LTR/RTL) — dejándolos en formato limpio `<cuerpo>-<dv>`.
 *
 * Alcance (siempre acotado por tenantId):
 *   - financeDte.receiverRut  (DTEs emitidos y recibidos)
 *   - crmAccount.rut
 *
 * NOTA: el fix de código (normalización robusta en cleanRut) ya resuelve el
 * matching en runtime SIN tocar datos. Este script es higiene secundaria para
 * que también funcionen queries de igualdad exacta en otras features.
 *
 * Seguridad:
 *   - Por defecto DRY-RUN: imprime qué filas cambiarían (antes→después con
 *     code points) y NO escribe nada.
 *   - Solo escribe si se pasa el flag `--apply`.
 *   - Idempotente: tras limpiar, los valores quedan en `[0-9K-]` (dentro del
 *     set permitido) y ya no vuelven a seleccionarse.
 *
 * Uso:
 *   npx tsx scripts/cleanup-rut-invisible.ts --tenant=gard            # dry-run
 *   npx tsx scripts/cleanup-rut-invisible.ts --tenant=gard --apply    # escribe
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** true si el valor tiene algún carácter fuera de [0-9kK.-] (RUT "sucio"). */
function isDirtyRut(rut: string | null | undefined): boolean {
  if (!rut) return false;
  return /[^0-9kK.\-]/.test(rut);
}

/** Normaliza a solo dígitos+K y lo deja como `<cuerpo>-<dv>`. */
function toCleanRut(rut: string): string {
  const compact = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (compact.length < 2) return compact;
  return `${compact.slice(0, -1)}-${compact.slice(-1)}`;
}

const codePoints = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const tenantId = tenantArg ? tenantArg.split("=")[1] : "gard";

  console.log(
    `\n=== cleanup-rut-invisible (tenant=${tenantId}, mode=${apply ? "APPLY" : "DRY-RUN"}) ===\n`,
  );

  let dteChanges = 0;
  let accChanges = 0;

  // --- financeDte.receiverRut ---
  const dtes = await prisma.financeDte.findMany({
    where: { tenantId },
    select: { id: true, folio: true, direction: true, receiverRut: true },
  });
  for (const dte of dtes) {
    if (!isDirtyRut(dte.receiverRut)) continue;
    const before = dte.receiverRut ?? "";
    const after = toCleanRut(before);
    if (before === after) continue;
    dteChanges++;
    console.log(`financeDte ${dte.id} folio=${dte.folio} dir=${dte.direction}`);
    console.log(`  before: ${JSON.stringify(before)}  cp=${JSON.stringify(codePoints(before))}`);
    console.log(`  after : ${JSON.stringify(after)}  cp=${JSON.stringify(codePoints(after))}`);
    if (apply) {
      await prisma.financeDte.update({ where: { id: dte.id }, data: { receiverRut: after } });
      console.log("  ✔ actualizado");
    }
  }

  // --- crmAccount.rut ---
  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, rut: true },
  });
  for (const acc of accounts) {
    if (!isDirtyRut(acc.rut)) continue;
    const before = acc.rut ?? "";
    const after = toCleanRut(before);
    if (before === after) continue;
    accChanges++;
    console.log(`crmAccount ${acc.id} name=${JSON.stringify(acc.name)}`);
    console.log(`  before: ${JSON.stringify(before)}  cp=${JSON.stringify(codePoints(before))}`);
    console.log(`  after : ${JSON.stringify(after)}  cp=${JSON.stringify(codePoints(after))}`);
    if (apply) {
      // NOTA: si crmAccount.rut tuviera un índice único por tenant, un
      // update podría chocar con una cuenta ya limpia con el mismo RUT.
      // El dry-run muestra los valores antes de escribir para revisarlo.
      await prisma.crmAccount.update({ where: { id: acc.id }, data: { rut: after } });
      console.log("  ✔ actualizado");
    }
  }

  console.log(
    `\n=== Resumen: ${dteChanges} DTE + ${accChanges} cuentas ${apply ? "actualizadas" : "a cambiar (dry-run)"} ===`,
  );
  if (!apply && dteChanges + accChanges > 0) {
    console.log("Dry-run: no se escribió nada. Re-ejecutar con --apply para aplicar.\n");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
