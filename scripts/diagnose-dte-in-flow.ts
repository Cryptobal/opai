/**
 * Diagnóstico: ¿por qué una factura (folio) NO aparece en el Flujo de caja?
 *
 * Recorre las MISMAS compuertas que `buildProjection` (projection.service.ts)
 * usa para decidir si un DTE emitido se pinta como fila de ingreso, y para cada
 * folio dice exactamente en cuál cae (o si debería aparecer y el problema es de
 * ventana / override de fecha).
 *
 * Uso:
 *   npx tsx scripts/diagnose-dte-in-flow.ts --tenant gard --folios 1725,1728
 *   npx tsx scripts/diagnose-dte-in-flow.ts --folios 1725         (tenant=gard)
 */
import { PrismaClient } from "@prisma/client";
import { bucketKeyFor, bucketBoundsFor } from "../src/modules/finance/cashflow/recurrence-engine";

const prisma = new PrismaClient();

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const iso = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : "—";

async function main() {
  const tenantSlug = argValue("--tenant") ?? "gard";
  const foliosArg = argValue("--folios");
  if (!foliosArg) {
    console.error("Falta --folios (ej: --folios 1725,1728)");
    process.exit(1);
  }
  const folios = foliosArg
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant no encontrado:", tenantSlug);
    process.exit(1);
  }

  console.log(`\n=== ${tenant.name} (${tenantSlug}) · folios: ${folios.join(", ")} ===\n`);

  for (const folio of folios) {
    // Un folio puede repetirse entre direction/dteType (la unicidad es la
    // tupla completa). Traemos TODOS los que calcen para no perder ninguno.
    const dtes = await prisma.financeDte.findMany({
      where: { tenantId: tenant.id, folio },
      select: {
        id: true,
        direction: true,
        dteType: true,
        folio: true,
        date: true,
        dueDate: true,
        siiStatus: true,
        paymentStatus: true,
        voidedByCreditNoteId: true,
        creditedNetAmount: true,
        netAmount: true,
        totalAmount: true,
        crmAccountId: true,
        installationId: true,
        receiverRut: true,
      },
    });

    if (dtes.length === 0) {
      console.log(`✗ folio ${folio}: NO existe ningún DTE con ese folio en este tenant.`);
      console.log(`   → Revisa que el folio sea de ESTE tenant (${tenantSlug}) y no de otro.\n`);
      continue;
    }

    for (const d of dtes) {
      const [override, exclusion] = await Promise.all([
        prisma.financeCashflowDteDateOverride.findFirst({
          where: { tenantId: tenant.id, dteId: d.id },
          select: { customDate: true, originalDate: true, reason: true },
        }),
        prisma.financeCashflowDteFlowExclusion.findFirst({
          where: { tenantId: tenant.id, dteId: d.id },
          select: { reason: true, createdAt: true },
        }),
      ]);

      const placementDate = override?.customDate ?? d.date;
      const bucketKey = bucketKeyFor(placementDate, "weekly");
      const bounds = bucketBoundsFor(placementDate, "weekly");

      console.log(`— folio ${folio} · id=${d.id}`);
      console.log(
        `   tipo=${d.dteType} dir=${d.direction} SII=${d.siiStatus} pago=${d.paymentStatus} ` +
          `neto=${d.netAmount} total=${d.totalAmount}`,
      );
      console.log(
        `   emisión=${iso(d.date)}  vencimiento=${iso(d.dueDate)}  ` +
          `crmAccount=${d.crmAccountId ?? "—"} instalación=${d.installationId ?? "—"} rut=${d.receiverRut}`,
      );
      if (override) {
        console.log(
          `   ⚑ OVERRIDE de fecha: se mueve de ${iso(override.originalDate)} → ${iso(override.customDate)} ` +
            `(${override.reason ?? "sin motivo"})`,
        );
      }
      console.log(
        `   se ubicaría en semana ${bucketKey} (${iso(bounds.start)}..${iso(bounds.end)})`,
      );

      // Evaluación de compuertas (mismo orden que projection.service.ts).
      const reasons: string[] = [];
      if (d.direction !== "ISSUED")
        reasons.push(`NO es emitida (direction=${d.direction}) → nunca es fila de ingreso sola.`);
      if ([56, 61].includes(d.dteType))
        reasons.push(`es Nota de Crédito/Débito (tipo ${d.dteType}) → excluida.`);
      if (["ANNULLED", "REJECTED"].includes(d.siiStatus))
        reasons.push(`SII=${d.siiStatus} → anulada/rechazada, excluida.`);
      if (d.voidedByCreditNoteId)
        reasons.push(`anulada por NC (${d.voidedByCreditNoteId}) → excluida.`);
      if (Number(d.creditedNetAmount) > 0 && Number(d.creditedNetAmount) >= Number(d.netAmount))
        reasons.push(
          `acreditada por NC parcial al 100% (creditedNet=${d.creditedNetAmount} ≥ neto=${d.netAmount}) → excluida.`,
        );
      if (exclusion)
        reasons.push(
          `OCULTA DEL FLUJO manualmente (${exclusion.reason ?? "sin motivo"}, ${iso(exclusion.createdAt)}). Reversible.`,
        );

      if (reasons.length > 0) {
        console.log(`   ✗ EXCLUIDA porque:`);
        for (const r of reasons) console.log(`      · ${r}`);
      } else {
        console.log(
          `   ✓ Pasa todas las compuertas → DEBERÍA aparecer en la semana ${bucketKey}.`,
        );
        console.log(
          `      Si no la ves, es tema de VENTANA: navega la grilla hasta incluir ${iso(bounds.start)}..${iso(bounds.end)}` +
            (override ? ` (ojo: el override la movió a esa semana).` : `.`),
        );
      }
      console.log("");
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
