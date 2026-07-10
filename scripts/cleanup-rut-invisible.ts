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
 *   - re-vínculo: tras normalizar, re-liga los DTE emitidos con
 *     crmAccountId=null que ahora matchean por RUT normalizado (incl. 1728).
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
 *
 * NUNCA correr con `--apply` sin confirmación explícita — escribe a prod.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Solo dígitos y la K del DV — clave de comparación (tolera invisibles). */
function cleanRut(rut: string | null | undefined): string {
  return (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Normaliza a solo dígitos+K y lo deja como `<cuerpo>-<dv>` (formato canónico). */
function toCleanRut(rut: string): string {
  const compact = cleanRut(rut);
  if (compact.length < 2) return compact;
  return `${compact.slice(0, -1)}-${compact.slice(-1)}`;
}

/**
 * true si la forma canónica difiere del valor guardado — captura tanto los
 * caracteres invisibles del XML SII como diferencias de formato (puntos,
 * guión ausente, DV en minúscula). Reemplaza al check anterior que solo
 * miraba caracteres fuera de [0-9kK.-] y dejaba pasar los RUT con puntos.
 */
function needsCleanup(rut: string | null | undefined): boolean {
  if (!rut) return false;
  return toCleanRut(rut) !== rut;
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
    if (!needsCleanup(dte.receiverRut)) continue;
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
    if (!needsCleanup(acc.rut)) continue;
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
    `\n=== Resumen limpieza: ${dteChanges} DTE + ${accChanges} cuentas ${apply ? "actualizadas" : "a cambiar (dry-run)"} ===`,
  );

  // --- Re-vínculo por RUT de DTE emitidos sin crmAccountId ---
  // Tras normalizar los RUT, los DTE emitidos que quedaron sin cuenta CRM
  // (crmAccountId=null) pueden ahora matchear por RUT normalizado. Recalculamos
  // el vínculo en JS (cleanRut a ambos lados) y — solo con --apply — lo
  // persistimos. Reporta cuántos quedaron vinculados (incluida la 1728).
  const linkableAccounts = await prisma.crmAccount.findMany({
    where: { tenantId, rut: { not: null } },
    select: { id: true, name: true, rut: true },
  });
  const accountByRutKey = new Map<string, { id: string; name: string | null }>();
  for (const a of linkableAccounts) {
    const key = cleanRut(a.rut);
    if (key && !accountByRutKey.has(key)) accountByRutKey.set(key, { id: a.id, name: a.name });
  }

  const unlinkedIssued = await prisma.financeDte.findMany({
    where: { tenantId, direction: "ISSUED", crmAccountId: null, receiverRut: { not: null } },
    select: { id: true, folio: true, receiverRut: true, receiverName: true },
  });

  let relinked = 0;
  for (const dte of unlinkedIssued) {
    const match = accountByRutKey.get(cleanRut(dte.receiverRut));
    if (!match) continue;
    relinked++;
    console.log(
      `re-vínculo folio=${dte.folio} (${dte.receiverName ?? ""}) → cuenta ${JSON.stringify(match.name)} [${match.id}]`,
    );
    if (apply) {
      await prisma.financeDte.update({ where: { id: dte.id }, data: { crmAccountId: match.id } });
      console.log("  ✔ vinculado");
    }
  }
  console.log(
    `=== Resumen re-vínculo: ${relinked} DTE emitido(s) ${apply ? "vinculado(s)" : "a vincular (dry-run)"} de ${unlinkedIssued.length} sin cuenta ===`,
  );

  if (!apply && dteChanges + accChanges + relinked > 0) {
    console.log("\nDry-run: no se escribió nada. Re-ejecutar con --apply para aplicar.\n");
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
