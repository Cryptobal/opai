/**
 * Resolución de propuestas multi-instalación (`maybePropagateBundleDealResolution`).
 *
 * Verifica que el deal sólo se cierra cuando TODAS las cotizaciones incluidas
 * están en estado terminal, que la mezcla aprobado/rechazado prefiere "ganado"
 * y registra el rechazo parcial, y que el rechazo total propaga "perdido".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const propagateDealWon = vi.fn();
const propagateDealLost = vi.fn();
const createCrmHistoryLog = vi.fn();

vi.mock("@/lib/crm/deal-propagation", () => ({
  propagateDealWon: (...args: unknown[]) => propagateDealWon(...args),
  propagateDealLost: (...args: unknown[]) => propagateDealLost(...args),
}));
vi.mock("@/lib/crm-history", () => ({
  createCrmHistoryLog: (...args: unknown[]) => createCrmHistoryLog(...args),
}));

import { maybePropagateBundleDealResolution } from "@/modules/cpq/bundles/bundle-resolution";

type Member = { quoteId: string; includedInProposal?: boolean };
type QuoteRow = { id: string; status: string };

function buildTx(opts: {
  member: { bundleId: string } | null;
  bundle: { id: string; code: string; dealId: string } | null;
  includedMembers: Member[];
  quotes: QuoteRow[];
}) {
  return {
    cpqProposalBundleQuote: {
      findFirst: vi.fn(async () => opts.member),
      findMany: vi.fn(async () => opts.includedMembers),
    },
    cpqProposalBundle: {
      findFirst: vi.fn(async () => opts.bundle),
    },
    cpqQuote: {
      findMany: vi.fn(async () => opts.quotes),
    },
    crmPipelineStage: {
      findFirst: vi.fn(async () => ({ id: "stage-1" })),
      create: vi.fn(async () => ({ id: "stage-1" })),
    },
    crmDeal: {
      update: vi.fn(async () => ({})),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("maybePropagateBundleDealResolution", () => {
  it("cotización standalone (sin bundle) → no propaga", async () => {
    const tx = buildTx({
      member: null,
      bundle: null,
      includedMembers: [],
      quotes: [],
    });
    const res = await maybePropagateBundleDealResolution(tx as never, "t1", "q1");
    expect(res).toEqual({ inBundle: false });
    expect(propagateDealWon).not.toHaveBeenCalled();
    expect(propagateDealLost).not.toHaveBeenCalled();
  });

  it("bundle con incluidas aún sin resolver → no propaga", async () => {
    const tx = buildTx({
      member: { bundleId: "b1" },
      bundle: { id: "b1", code: "PROP-1", dealId: "deal-1" },
      includedMembers: [{ quoteId: "q1" }, { quoteId: "q2" }],
      quotes: [
        { id: "q1", status: "approved" },
        { id: "q2", status: "sent" }, // aún pendiente
      ],
    });
    const res = await maybePropagateBundleDealResolution(tx as never, "t1", "q1");
    expect(res).toMatchObject({ inBundle: true, resolved: false });
    expect(propagateDealWon).not.toHaveBeenCalled();
    expect(propagateDealLost).not.toHaveBeenCalled();
  });

  it("todas rechazadas → propaga deal perdido", async () => {
    const tx = buildTx({
      member: { bundleId: "b1" },
      bundle: { id: "b1", code: "PROP-1", dealId: "deal-1" },
      includedMembers: [{ quoteId: "q1" }, { quoteId: "q2" }],
      quotes: [
        { id: "q1", status: "rejected" },
        { id: "q2", status: "rejected" },
      ],
    });
    const res = await maybePropagateBundleDealResolution(tx as never, "t1", "q1");
    expect(res).toMatchObject({ inBundle: true, resolved: true, outcome: "lost" });
    expect(propagateDealLost).toHaveBeenCalledTimes(1);
    expect(propagateDealWon).not.toHaveBeenCalled();
    expect(createCrmHistoryLog).not.toHaveBeenCalled();
    expect(tx.crmDeal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "lost" }) }),
    );
  });

  it("mezcla aprobado + rechazado → prefiere ganado y registra rechazo parcial", async () => {
    const tx = buildTx({
      member: { bundleId: "b1" },
      bundle: { id: "b1", code: "PROP-1", dealId: "deal-1" },
      includedMembers: [{ quoteId: "q1" }, { quoteId: "q2" }],
      quotes: [
        { id: "q1", status: "approved" },
        { id: "q2", status: "rejected" },
      ],
    });
    const res = await maybePropagateBundleDealResolution(tx as never, "t1", "q2");
    expect(res).toMatchObject({
      inBundle: true,
      resolved: true,
      outcome: "won",
      partialRejection: true,
    });
    expect(propagateDealWon).toHaveBeenCalledTimes(1);
    expect(propagateDealLost).not.toHaveBeenCalled();
    expect(createCrmHistoryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "bundle",
        action: "bundle_partial_rejection",
        details: expect.objectContaining({
          approvedQuoteIds: ["q1"],
          rejectedQuoteIds: ["q2"],
        }),
      }),
      expect.anything(),
    );
    expect(tx.crmDeal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "won" }) }),
    );
  });

  it("todas aprobadas → propaga ganado sin rechazo parcial", async () => {
    const tx = buildTx({
      member: { bundleId: "b1" },
      bundle: { id: "b1", code: "PROP-1", dealId: "deal-1" },
      includedMembers: [{ quoteId: "q1" }, { quoteId: "q2" }],
      quotes: [
        { id: "q1", status: "approved" },
        { id: "q2", status: "accepted" },
      ],
    });
    const res = await maybePropagateBundleDealResolution(tx as never, "t1", "q1");
    expect(res).toMatchObject({
      inBundle: true,
      resolved: true,
      outcome: "won",
      partialRejection: false,
    });
    expect(propagateDealWon).toHaveBeenCalledTimes(1);
    expect(createCrmHistoryLog).not.toHaveBeenCalled();
  });
});
