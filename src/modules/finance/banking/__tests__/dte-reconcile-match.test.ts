import { describe, expect, it } from "vitest";
import {
  compareDteCandidatesByAmountMatch,
  dteAmountMatchTier,
  dteIneligibleReconcileReason,
  isDteEligibleForBankReconcile,
  isExactDteAmountMatch,
  sortDteCandidatesByAmountMatch,
} from "../dte-reconcile-match";

function cand(overrides: {
  id: string;
  amountPending: number;
  total?: number;
  issuedAt: string;
}) {
  return {
    id: overrides.id,
    amountPending: overrides.amountPending,
    total: overrides.total ?? overrides.amountPending,
    issuedAt: overrides.issuedAt,
  };
}

describe("dte-reconcile-match", () => {
  describe("elegibilidad", () => {
    it("rechaza borradores (siiStatus DRAFT o folio 0)", () => {
      expect(
        isDteEligibleForBankReconcile({ siiStatus: "DRAFT", folio: 0 }),
      ).toBe(false);
      expect(
        isDteEligibleForBankReconcile({ siiStatus: "ACCEPTED", folio: 0 }),
      ).toBe(false);
      expect(
        dteIneligibleReconcileReason({ siiStatus: "DRAFT", folio: 1780 }),
      ).toMatch(/borrador/i);
    });

    it("acepta facturas emitidas pendientes", () => {
      expect(
        isDteEligibleForBankReconcile({
          siiStatus: "ACCEPTED",
          folio: 1780,
          dteType: 33,
        }),
      ).toBe(true);
      expect(
        isDteEligibleForBankReconcile({
          siiStatus: "PENDING",
          folio: 100,
          dteType: 33,
        }),
      ).toBe(true);
    });

    it("rechaza anuladas, NC y ND", () => {
      expect(
        isDteEligibleForBankReconcile({
          siiStatus: "ANNULLED",
          folio: 10,
        }),
      ).toBe(false);
      expect(
        isDteEligibleForBankReconcile({
          siiStatus: "ACCEPTED",
          folio: 10,
          dteType: 61,
        }),
      ).toBe(false);
    });
  });

  describe("ranking de monto", () => {
    const bank = 7_938_500;

    it("marca match exacto por pendiente o total", () => {
      expect(
        isExactDteAmountMatch(bank, { amountPending: bank, total: bank }),
      ).toBe(true);
      expect(
        isExactDteAmountMatch(bank, {
          amountPending: bank - 500_000,
          total: bank,
        }),
      ).toBe(true);
      expect(
        isExactDteAmountMatch(bank, {
          amountPending: 1_000_000,
          total: 1_000_000,
        }),
      ).toBe(false);
    });

    it("prioriza pendiente exacto sobre total exacto", () => {
      expect(dteAmountMatchTier(bank, { amountPending: bank, total: bank })).toBe(
        0,
      );
      expect(
        dteAmountMatchTier(bank, { amountPending: 1, total: bank }),
      ).toBe(1);
    });

    it("deja el match exacto primero aunque sea más antiguo", () => {
      const newerOther = cand({
        id: "draft-like",
        amountPending: 9_511_641,
        issuedAt: "2026-08-20T00:00:00.000Z",
      });
      const olderMatch = cand({
        id: "factura",
        amountPending: bank,
        issuedAt: "2026-07-01T00:00:00.000Z",
      });
      const sorted = sortDteCandidatesByAmountMatch(
        [newerOther, olderMatch],
        bank,
      );
      expect(sorted[0]!.id).toBe("factura");
      expect(
        compareDteCandidatesByAmountMatch(bank, olderMatch, newerOther),
      ).toBeLessThan(0);
    });

    it("entre dos no-match, el más cercano en monto gana; empate por fecha desc", () => {
      const close = cand({
        id: "close",
        amountPending: bank + 10_000,
        issuedAt: "2026-06-01T00:00:00.000Z",
      });
      const far = cand({
        id: "far",
        amountPending: bank + 500_000,
        issuedAt: "2026-08-01T00:00:00.000Z",
      });
      const sorted = sortDteCandidatesByAmountMatch([far, close], bank);
      expect(sorted[0]!.id).toBe("close");
    });
  });
});
