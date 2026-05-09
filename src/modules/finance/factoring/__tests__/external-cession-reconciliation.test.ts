import { describe, expect, it } from "vitest";
import { calculateExternalCessionTerms } from "../external-cession-reconciliation";

describe("calculateExternalCessionTerms", () => {
  it("rebuilds neutral terms for an externally accepted full cession", () => {
    const terms = calculateExternalCessionTerms({
      invoiceAmount: 1_338_564,
      montoCesion: 1_338_564,
      fechaCesion: "2026-05-08",
      fechaVencimiento: "2026-06-07",
    });

    expect(terms).toEqual({
      invoiceAmount: 1_338_564,
      montoCesion: 1_338_564,
      plazoDias: 30,
      advanceRate: 100,
      advanceAmount: 1_338_564,
      interestRate: 0,
      interestAmount: 0,
      commissionAmount: 0,
      netAdvance: 1_338_564,
      retentionAmount: 0,
    });
  });
});
