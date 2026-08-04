import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  cpqProposalBundle: { deleteMany: vi.fn() },
  cpqProposalBundleQuote: { count: vi.fn(), delete: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqProposalBundle: { findFirst: vi.fn(), deleteMany: vi.fn() },
    cpqProposalBundleQuote: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  },
}));

vi.mock("@/lib/cpq/document-counter", () => ({ nextDocumentCode: vi.fn() }));
vi.mock("@/lib/crm-history", () => ({ createCrmHistoryLog: vi.fn() }));
vi.mock("@/modules/cpq/quote-trash.service", () => ({ deleteQuoteToTrash: vi.fn() }));
vi.mock("@/modules/cpq/quote-delete-impact", () => ({ buildQuoteDeleteImpact: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { deleteQuoteToTrash } from "@/modules/cpq/quote-trash.service";
import { buildQuoteDeleteImpact } from "@/modules/cpq/quote-delete-impact";
import {
  BundleDeleteBlockedError,
  deleteBundle,
  ensureBundleNotEmpty,
} from "../bundle.service";

const bundleRow = {
  id: "bundle-1",
  dealId: "deal-1",
  accountId: "acc-1",
  contactId: null,
  currency: "UF",
  status: "draft",
  code: "PROP-2026-001",
  name: "Propuesta test",
  visibleInClientPortal: null,
};

describe("deleteBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cpqProposalBundle.findFirst).mockResolvedValue(bundleRow as never);
    vi.mocked(deleteQuoteToTrash).mockResolvedValue({
      trashId: "trash-x",
      code: "CPQ-2026-001",
      bundleId: "bundle-1",
    } as never);
    txMock.cpqProposalBundle.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  it("unlink: borra la propuesta sin tocar cotizaciones", async () => {
    vi.mocked(prisma.cpqProposalBundleQuote.findMany).mockResolvedValue([
      { quoteId: "q1" },
      { quoteId: "q2" },
    ] as never);

    const result = await deleteBundle({
      tenantId: "t1",
      bundleId: "bundle-1",
      mode: "unlink",
      userId: "u1",
    });

    expect(result).toEqual({ bundleDeleted: true, mode: "unlink", trashedQuoteIds: [] });
    expect(deleteQuoteToTrash).not.toHaveBeenCalled();
    expect(buildQuoteDeleteImpact).not.toHaveBeenCalled();
    expect(txMock.cpqProposalBundle.deleteMany).toHaveBeenCalledWith({
      where: { id: "bundle-1", tenantId: "t1" },
    });
    expect(createCrmHistoryLog).toHaveBeenCalled();
  });

  it("cascade: envía cada cotización a papelera y borra la propuesta", async () => {
    vi.mocked(prisma.cpqProposalBundleQuote.findMany).mockResolvedValue([
      { quoteId: "q1" },
      { quoteId: "q2" },
    ] as never);
    vi.mocked(buildQuoteDeleteImpact).mockResolvedValue({ blockers: [] } as never);

    const result = await deleteBundle({
      tenantId: "t1",
      bundleId: "bundle-1",
      mode: "cascade",
      userId: "u1",
    });

    expect(deleteQuoteToTrash).toHaveBeenCalledTimes(2);
    expect(result.trashedQuoteIds).toEqual(["q1", "q2"]);
    expect(result.mode).toBe("cascade");
    expect(txMock.cpqProposalBundle.deleteMany).toHaveBeenCalled();
  });

  it("cascade sin force: lanza BundleDeleteBlockedError cuando hay bloqueos", async () => {
    vi.mocked(prisma.cpqProposalBundleQuote.findMany).mockResolvedValue([
      { quoteId: "q1" },
    ] as never);
    vi.mocked(buildQuoteDeleteImpact).mockResolvedValue({
      blockers: [{ code: "CONTRACT_GENERATED", label: "x" }],
    } as never);

    await expect(
      deleteBundle({ tenantId: "t1", bundleId: "bundle-1", mode: "cascade" }),
    ).rejects.toBeInstanceOf(BundleDeleteBlockedError);
    expect(deleteQuoteToTrash).not.toHaveBeenCalled();
  });

  it("cascade con force: ignora bloqueos", async () => {
    vi.mocked(prisma.cpqProposalBundleQuote.findMany).mockResolvedValue([
      { quoteId: "q1" },
    ] as never);

    const result = await deleteBundle({
      tenantId: "t1",
      bundleId: "bundle-1",
      mode: "cascade",
      force: true,
    });

    expect(buildQuoteDeleteImpact).not.toHaveBeenCalled();
    expect(deleteQuoteToTrash).toHaveBeenCalledTimes(1);
    expect(result.bundleDeleted).toBe(true);
  });
});

describe("ensureBundleNotEmpty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.cpqProposalBundle.deleteMany.mockResolvedValue({ count: 1 } as never);
  });

  it("elimina la propuesta cuando ya no tiene miembros", async () => {
    txMock.cpqProposalBundleQuote.count.mockResolvedValue(0 as never);

    const result = await ensureBundleNotEmpty({
      tx: txMock as never,
      tenantId: "t1",
      bundleId: "bundle-1",
    });

    expect(result).toEqual({ bundleDeleted: true });
    expect(txMock.cpqProposalBundle.deleteMany).toHaveBeenCalledWith({
      where: { id: "bundle-1", tenantId: "t1" },
    });
  });

  it("conserva la propuesta cuando aún tiene miembros", async () => {
    txMock.cpqProposalBundleQuote.count.mockResolvedValue(2 as never);

    const result = await ensureBundleNotEmpty({
      tx: txMock as never,
      tenantId: "t1",
      bundleId: "bundle-1",
    });

    expect(result).toEqual({ bundleDeleted: false });
    expect(txMock.cpqProposalBundle.deleteMany).not.toHaveBeenCalled();
  });
});
