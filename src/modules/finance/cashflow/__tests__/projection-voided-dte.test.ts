import { describe, it, expect } from "vitest";

/**
 * Fix Bug A: facturas anuladas por NC no deben entrar al flujo de caja por el
 * matcher de bank-links — ni como fila ni como monto.
 *
 * `buildProjection` es una función monolítica respaldada por Prisma (no
 * invocable en un unit test sin una DB real; además, mockear Prisma NO ejecuta
 * el `where`). Siguiendo el estilo de `projection-anchor` / `projection-drift`,
 * replicamos EXACTAMENTE el slice afectado por el fix para fijar su contrato:
 *
 *   1. el `where` del matcher (projection.service.ts ~L1015), incluyendo las
 *      dos condiciones nuevas: `siiStatus: { notIn: ["ANNULLED","REJECTED"] }`
 *      y `voidedByCreditNoteId: null`;
 *   2. el loop if(best)/else (~L1089-1184) que muta occurrences proyectadas o
 *      pushea sintéticas PAID;
 *   3. la acumulación de saldo real (~L1682 / L1691) que alimenta
 *      `b.actualIncome`.
 *
 * MANTENER SINCRONIZADO con el `where` real: si allá cambia el criterio, acá
 * `passesMatcherWhere` debe cambiar igual.
 */

type DteInfo = {
  id: string;
  dteType: number; // 33 factura afecta, 56/61 NC/ND
  siiStatus: string; // "ACCEPTED" | "ANNULLED" | "REJECTED" | ...
  voidedByCreditNoteId: string | null; // NC total (CodRef=1) → anulada
  creditedNetAmount: number; // > 0 → hay NC parcial (CodRef=3)
  crmAccountId: string;
  totalAmount: number; // agg.totalAmount (suma de bank txs del DTE)
  hasBankLink: boolean; // ¿tiene allocation bancaria? → entra al matcher
};

type Occ = {
  itemId: string | null;
  source: string; // "CONTRACT" | "AJUSTE" | ...
  status: "PROJECTED" | "PAID";
  kind: "INCOME" | "EXPENSE";
  amountClp: number;
  actualAmountClp: number | null;
  dteId: string | null;
  bankTransactionId: string | null;
  crmAccountId: string;
  isSynthetic?: boolean;
};

/**
 * Mirror EXACTO del `where` del matcher tras el fix (projection.service.ts
 * ~L1015). `withVoidedFilter=false` reproduce el estado PRE-fix (sólo excluía
 * NC/ND 56/61); `true` agrega las dos condiciones del fix.
 */
function passesMatcherWhere(
  d: DteInfo,
  opts: { withVoidedFilter: boolean },
): boolean {
  // dteType: { notIn: [56, 61] } — ya existía antes del fix.
  if (d.dteType === 56 || d.dteType === 61) return false;
  if (!opts.withVoidedFilter) return true;
  // siiStatus: { notIn: ["ANNULLED", "REJECTED"] }
  if (d.siiStatus === "ANNULLED" || d.siiStatus === "REJECTED") return false;
  // voidedByCreditNoteId: null  (NC total). OJO: NO se filtra por
  // creditedNetAmount — la NC parcial permanece en el flujo.
  if (d.voidedByCreditNoteId !== null) return false;
  return true;
}

/**
 * Mirror del loop if(best)/else. Sólo los DTEs con bank-link entran
 * (`dtesToResolve` se arma desde `dteLinkAgg`). El `where` alimenta el map
 * `dteToCrmAccount`; un DTE que no pasa el `where` no está en el map y el guard
 * `if (!crmAccountId) continue` lo saltea (no muta ni pushea nada por él).
 * Devuelve el array de occurrences resultante (copia; no muta la entrada).
 */
function runMatcher(
  dtes: DteInfo[],
  projected: Occ[],
  opts: { withVoidedFilter: boolean },
): Occ[] {
  const occs = projected.map((o) => ({ ...o }));
  const entering = dtes.filter((d) => d.hasBankLink);
  const inMap = new Set(
    entering.filter((d) => passesMatcherWhere(d, opts)).map((d) => d.id),
  );
  for (const d of entering) {
    if (!inMap.has(d.id)) continue; // guard: crmAccountId ausente en el map
    const best = occs.find(
      (o) =>
        o.crmAccountId === d.crmAccountId &&
        o.status === "PROJECTED" &&
        o.bankTransactionId === null,
    );
    if (best) {
      // Rama if(best): muta la cuota proyectada del contrato.
      best.status = "PAID";
      best.bankTransactionId = `tx_${d.id}`;
      best.actualAmountClp = d.totalAmount;
      best.dteId = d.id;
    } else {
      // Rama else: pushea occurrence sintética PAID (amountClp=0,
      // actualAmountClp=monto banco).
      occs.push({
        itemId: `item_${d.crmAccountId}`,
        source: "CONTRACT",
        status: "PAID",
        kind: "INCOME",
        amountClp: 0,
        actualAmountClp: d.totalAmount,
        dteId: d.id,
        bankTransactionId: `tx_${d.id}`,
        crmAccountId: d.crmAccountId,
        isSynthetic: true,
      });
    }
  }
  return occs;
}

/** Mirror de la acumulación de `b.actualIncome` (projection.service.ts L1682 / L1691). */
function actualIncomeOf(occs: Occ[]): number {
  let actualIncome = 0;
  for (const o of occs) {
    if (o.kind !== "INCOME") continue;
    const alreadyInBankReal =
      o.status === "PAID" &&
      o.bankTransactionId !== null &&
      o.itemId !== null &&
      o.source !== "AJUSTE";
    if (!alreadyInBankReal) {
      if (o.actualAmountClp !== null) actualIncome += o.actualAmountClp;
    } else {
      actualIncome += o.actualAmountClp ?? o.amountClp;
    }
  }
  return actualIncome;
}

/** Cuota de contrato PROJECTED base (sana, sin cobrar). */
function contractCuota(part: Partial<Occ> = {}): Occ {
  return {
    itemId: "item_crm_1",
    source: "CONTRACT",
    status: "PROJECTED",
    kind: "INCOME",
    amountClp: 1_000_000,
    actualAmountClp: null,
    dteId: null,
    bankTransactionId: null,
    crmAccountId: "crm_1",
    ...part,
  };
}

const VOIDED_AMOUNT = 11_206_786; // caso real Polpaico quilicura

describe("Bug A — facturas anuladas por NC excluidas del matcher de bank-links", () => {
  it("FIX (bloqueante): factura anulada con bank-link → sin fila y actualIncome BAJA exactamente su monto", () => {
    const voided: DteInfo = {
      id: "dte_voided",
      dteType: 33,
      siiStatus: "ACCEPTED", // el SII la mantiene ACCEPTED; la anulación es la NC
      voidedByCreditNoteId: "nc_1",
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: VOIDED_AMOUNT,
      hasBankLink: true,
    };

    const pre = runMatcher([voided], [contractCuota()], { withVoidedFilter: false });
    const post = runMatcher([voided], [contractCuota()], { withVoidedFilter: true });

    const incomePre = actualIncomeOf(pre);
    const incomePost = actualIncomeOf(post);

    // (a) POST-fix: ninguna occurrence carga el dteId de la factura anulada
    //     → no genera fila.
    expect(post.some((o) => o.dteId === "dte_voided")).toBe(false);
    // PRE-fix sí lo cargaba (el bug).
    expect(pre.some((o) => o.dteId === "dte_voided")).toBe(true);

    // (b) el saldo real BAJA, y baja EXACTAMENTE el monto de la anulada.
    expect(incomePost).toBeLessThan(incomePre);
    expect(incomePre - incomePost).toBe(VOIDED_AMOUNT);
    expect(incomePre).toBe(VOIDED_AMOUNT); // pre: la anulada inflaba el saldo
    expect(incomePost).toBe(0); // post: la cuota queda proyectada, sin real
  });

  it("la cuota del contrato que quedaba falsamente PAID vuelve a PROJECTED y sin dteId", () => {
    const voided: DteInfo = {
      id: "dte_voided",
      dteType: 33,
      siiStatus: "ACCEPTED",
      voidedByCreditNoteId: "nc_1",
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: VOIDED_AMOUNT,
      hasBankLink: true,
    };

    const pre = runMatcher([voided], [contractCuota()], { withVoidedFilter: false });
    const post = runMatcher([voided], [contractCuota()], { withVoidedFilter: true });

    // PRE-fix: la cuota real quedaba marcada PAID con la plata de la anulada.
    const cuotaPre = pre.find((o) => o.itemId === "item_crm_1")!;
    expect(cuotaPre.status).toBe("PAID");
    expect(cuotaPre.dteId).toBe("dte_voided");

    // POST-fix: la cuota vuelve a PROJECTED, sin dteId colgado ni monto real.
    const cuotaPost = post.find((o) => o.itemId === "item_crm_1")!;
    expect(cuotaPost.status).toBe("PROJECTED");
    expect(cuotaPost.dteId).toBeNull();
    expect(cuotaPost.actualAmountClp).toBeNull();
  });

  it("factura anulada SIN bank-link → nunca entra al matcher (no-regresión, ya la frenaba orphanDtes)", () => {
    const voided: DteInfo = {
      id: "dte_voided_nolink",
      dteType: 33,
      siiStatus: "ACCEPTED",
      voidedByCreditNoteId: "nc_1",
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: VOIDED_AMOUNT,
      hasBankLink: false, // sin allocation bancaria
    };

    const post = runMatcher([voided], [contractCuota()], { withVoidedFilter: true });
    // No aparece por ninguna vía; la cuota sigue intacta.
    expect(post.some((o) => o.dteId === "dte_voided_nolink")).toBe(false);
    expect(post.find((o) => o.itemId === "item_crm_1")!.status).toBe("PROJECTED");
    expect(actualIncomeOf(post)).toBe(0);
  });

  it("NO-REGRESIÓN caso sano: factura NO anulada con bank-link → comportamiento IDÉNTICO pre/post fix", () => {
    const sane: DteInfo = {
      id: "dte_sane",
      dteType: 33,
      siiStatus: "ACCEPTED",
      voidedByCreditNoteId: null,
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: 900_000,
      hasBankLink: true,
    };

    const pre = runMatcher([sane], [contractCuota()], { withVoidedFilter: false });
    const post = runMatcher([sane], [contractCuota()], { withVoidedFilter: true });

    // El fix no toca el caso sano: mismo resultado exacto.
    expect(post).toEqual(pre);
    // Se engancha, marca PAID y suma su actualAmountClp.
    const cuota = post.find((o) => o.itemId === "item_crm_1")!;
    expect(cuota.status).toBe("PAID");
    expect(cuota.dteId).toBe("dte_sane");
    expect(cuota.actualAmountClp).toBe(900_000);
    expect(actualIncomeOf(post)).toBe(900_000);
    expect(actualIncomeOf(post)).toBe(actualIncomeOf(pre));
  });

  it("NC PARCIAL (creditedNetAmount>0, voidedByCreditNoteId=null) → PERMANECE en el flujo, NO se excluye", () => {
    const partial: DteInfo = {
      id: "dte_partial",
      dteType: 33,
      siiStatus: "ACCEPTED",
      voidedByCreditNoteId: null, // NO anulada total
      creditedNetAmount: 300_000, // tiene NC parcial CodRef=3
      crmAccountId: "crm_1",
      totalAmount: 700_000, // monto ajustado
      hasBankLink: true,
    };

    // El fix NO debe excluir por creditedNetAmount.
    expect(passesMatcherWhere(partial, { withVoidedFilter: true })).toBe(true);

    const post = runMatcher([partial], [contractCuota()], { withVoidedFilter: true });
    const cuota = post.find((o) => o.itemId === "item_crm_1")!;
    expect(cuota.status).toBe("PAID");
    expect(cuota.dteId).toBe("dte_partial");
    expect(actualIncomeOf(post)).toBe(700_000);
  });

  it("DTE con siiStatus REJECTED y bank-link → excluido", () => {
    const rejected: DteInfo = {
      id: "dte_rejected",
      dteType: 33,
      siiStatus: "REJECTED",
      voidedByCreditNoteId: null,
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: 500_000,
      hasBankLink: true,
    };

    expect(passesMatcherWhere(rejected, { withVoidedFilter: true })).toBe(false);

    const post = runMatcher([rejected], [contractCuota()], { withVoidedFilter: true });
    expect(post.some((o) => o.dteId === "dte_rejected")).toBe(false);
    expect(post.find((o) => o.itemId === "item_crm_1")!.status).toBe("PROJECTED");
    expect(actualIncomeOf(post)).toBe(0);
  });

  it("rama else (sin cuota PROJECTED disponible): la anulada tampoco pushea sintética PAID", () => {
    const voided: DteInfo = {
      id: "dte_voided_else",
      dteType: 33,
      siiStatus: "ANNULLED",
      voidedByCreditNoteId: "nc_1",
      creditedNetAmount: 0,
      crmAccountId: "crm_1",
      totalAmount: VOIDED_AMOUNT,
      hasBankLink: true,
    };

    // Sin occurrences proyectadas → pre-fix caía en la rama else (sintética).
    const pre = runMatcher([voided], [], { withVoidedFilter: false });
    const post = runMatcher([voided], [], { withVoidedFilter: true });

    expect(pre.some((o) => o.isSynthetic && o.dteId === "dte_voided_else")).toBe(true);
    expect(actualIncomeOf(pre)).toBe(VOIDED_AMOUNT);

    expect(post.length).toBe(0);
    expect(actualIncomeOf(post)).toBe(0);
  });
});
