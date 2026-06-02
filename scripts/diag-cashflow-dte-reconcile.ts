import "dotenv/config"; // carga .env (DATABASE_URL real). READ-ONLY: solo queries.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Folios / clientes que el usuario reporta inconsistentes.
const FOLIOS = [1705, 1706, 1707, 1708, 1709, 1710, 1711, 1713, 1714, 1715, 1716];
const NAMES = ["Pine", "Transmat", "FT Foods", "Fapama", "Berlintex", "East West", "Limpiotec"];

function n(x: unknown): number {
  return x == null ? 0 : Number(x);
}

async function main() {
  // 1) DTEs por folio + borradores (folio null) de los clientes citados.
  const dtes = await prisma.financeDte.findMany({
    where: {
      direction: "ISSUED",
      OR: [
        { folio: { in: FOLIOS } },
        // Borradores (sin folio o folio bajo): los pescamos por receptor.
        { receiverName: { in: ["Transmat", "Ametel", "Fapama", "Pine"] } },
      ],
    },
    select: {
      id: true, tenantId: true, folio: true, date: true, dueDate: true,
      totalAmount: true, netAmount: true, creditedNetAmount: true,
      receiverName: true, crmAccountId: true, installationId: true,
      direction: true, siiStatus: true, paymentStatus: true, dteType: true,
      voidedByCreditNoteId: true,
    },
    orderBy: [{ folio: "desc" }],
  });

  console.log("\n════════ DTEs (factura/borrador) ════════");
  for (const d of dtes) {
    console.log(
      `folio=${d.folio ?? "BORR"} | ${d.receiverName} | total=${n(d.totalAmount).toLocaleString("es-CL")} | net=${n(d.netAmount).toLocaleString("es-CL")} | date=${d.date.toISOString().slice(0, 10)} | inst=${d.installationId ?? "-"} | crm=${d.crmAccountId ?? "-"} | sii=${d.siiStatus} | pago=${d.paymentStatus} | type=${d.dteType} | voidedByNC=${d.voidedByCreditNoteId ?? "-"} | dteId=${d.id}`,
    );
  }

  const tenantId = dtes[0]?.tenantId;
  if (!tenantId) {
    console.log("Sin DTEs. Abort.");
    return;
  }

  // 2) Items de cashflow de esos clientes/instalaciones.
  const instIds = [...new Set(dtes.map((d) => d.installationId).filter(Boolean))] as string[];
  const crmIds = [...new Set(dtes.map((d) => d.crmAccountId).filter(Boolean))] as string[];
  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      isActive: true,
      kind: "INCOME",
      OR: [
        { installationId: { in: instIds } },
        { crmAccountId: { in: crmIds } },
        ...NAMES.map((nm) => ({ name: { contains: nm, mode: "insensitive" as const } })),
      ],
    },
    select: {
      id: true, name: true, source: true, recurrence: true, amount: true,
      currency: true, ufFixingPolicy: true, ufFixingDay: true,
      crmAccountId: true, installationId: true, sourceRefId: true,
    },
    orderBy: [{ name: "asc" }],
  });

  console.log("\n════════ ITEMS de cashflow (INCOME activos) ════════");
  for (const it of items) {
    console.log(
      `"${it.name}" | src=${it.source} | rec=${it.recurrence} | amount=${n(it.amount).toLocaleString("es-CL")} ${it.currency} | ufPol=${it.ufFixingPolicy ?? "-"} | inst=${it.installationId ?? "-"} | crm=${it.crmAccountId ?? "-"} | itemId=${it.id}`,
    );
  }

  // 3) Occurrences materializadas vinculadas a esos DTEs o items.
  const itemIds = items.map((i) => i.id);
  const dteIds = dtes.map((d) => d.id);
  const occs = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      OR: [{ dteId: { in: dteIds } }, { itemId: { in: itemIds } }],
    },
    select: {
      id: true, itemId: true, scheduledDate: true, amountClp: true,
      amountOverride: true, ufValueUsed: true, status: true, dteId: true,
      bankTransactionId: true,
    },
    orderBy: [{ scheduledDate: "asc" }],
  });

  const itemNameById = new Map(items.map((i) => [i.id, i.name]));
  const dteFolioById = new Map(dtes.map((d) => [d.id, d.folio ?? "BORR"]));
  console.log("\n════════ OCCURRENCES materializadas (de esos items/DTEs) ════════");
  for (const o of occs) {
    console.log(
      `item="${itemNameById.get(o.itemId ?? "") ?? o.itemId}" | sched=${o.scheduledDate.toISOString().slice(0, 10)} | amount=${n(o.amountClp).toLocaleString("es-CL")} | override=${o.amountOverride == null ? "-" : n(o.amountOverride).toLocaleString("es-CL")} | uf=${o.ufValueUsed ?? "-"} | status=${o.status} | dte=${o.dteId ? dteFolioById.get(o.dteId) : "-"} | bankTx=${o.bankTransactionId ? "Y" : "-"}`,
    );
  }

  // 4) Overrides de fecha de DTE.
  const overrides = await prisma.financeCashflowDteDateOverride.findMany({
    where: { tenantId, dteId: { in: dteIds } },
    select: { dteId: true, originalDate: true, customDate: true },
  });
  console.log("\n════════ DTE date overrides ════════");
  for (const ov of overrides) {
    console.log(`dte=${dteFolioById.get(ov.dteId)} | orig=${ov.originalDate.toISOString().slice(0, 10)} → custom=${ov.customDate.toISOString().slice(0, 10)}`);
  }
  if (overrides.length === 0) console.log("(ninguno)");

  // 5) UF actual para sanity de FT Foods / items UF.
  console.log("\n════════ Sanity UF: items en UF y su CLP proyectado ════════");
  const ufItems = items.filter((i) => i.currency === "UF");
  for (const it of ufItems) {
    console.log(`"${it.name}" amount=${n(it.amount)} UF → si UF≈39.000 ⇒ ${(n(it.amount) * 39000).toLocaleString("es-CL")} CLP (cashflow muestra el real con ufValueUsed)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
