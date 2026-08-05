import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findFirst: vi.fn() },
  },
}));
vi.mock("../flow-row-account-plan.service", () => ({
  resolveAccountPlanIdForFlowRow: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { resolveAccountPlanIdForFlowRow } from "../flow-row-account-plan.service";
import { resolveRuleAction } from "../rule-action-resolver";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveRuleAction", () => {
  it("legacy con cuenta", async () => {
    const out = await resolveRuleAction(TENANT, {
      handlingMode: "CATEGORIZED",
      accountPlanId: "ap-1",
      requiresReview: false,
    });
    expect(out).toEqual({
      ok: true,
      accountPlanId: "ap-1",
      requiresReview: false,
    });
  });

  it("legacy sin cuenta", async () => {
    const out = await resolveRuleAction(TENANT, {
      handlingMode: "CATEGORIZED",
      accountPlanId: null,
      requiresReview: true,
    });
    expect(out).toEqual({ ok: false, reason: "NO_ACCOUNT_PLAN" });
  });

  it("FLOW_ROW con fila válida", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      categoryId: "cat-1",
    });
    asMock(resolveAccountPlanIdForFlowRow).mockResolvedValue("ap-9");
    const out = await resolveRuleAction(TENANT, {
      kind: "FLOW_ROW",
      flowRowId: "row-1",
      requiresReview: false,
    });
    expect(out).toEqual({
      ok: true,
      accountPlanId: "ap-9",
      requiresReview: false,
    });
  });

  it("FLOW_ROW fila archivada / no encontrada", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(null);
    const out = await resolveRuleAction(TENANT, {
      kind: "FLOW_ROW",
      flowRowId: "row-x",
    });
    expect(out).toEqual({ ok: false, reason: "ROW_NOT_FOUND" });
  });

  it("FLOW_ROW sin cuenta en categoría", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      categoryId: null,
    });
    asMock(resolveAccountPlanIdForFlowRow).mockResolvedValue(null);
    const out = await resolveRuleAction(TENANT, {
      kind: "FLOW_ROW",
      flowRowId: "row-1",
      requiresReview: false,
    });
    expect(out).toEqual({ ok: false, reason: "ROW_WITHOUT_ACCOUNT" });
  });

  it("TGR_PICK nunca auto-aplica", async () => {
    const out = await resolveRuleAction(TENANT, { kind: "TGR_PICK" });
    expect(out).toEqual({ ok: false, reason: "TGR_MANUAL" });
  });

  it("FLOW_ROW requiresReview default true si omitido", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-1",
      categoryId: "cat-1",
    });
    asMock(resolveAccountPlanIdForFlowRow).mockResolvedValue("ap-1");
    const out = await resolveRuleAction(TENANT, {
      kind: "FLOW_ROW",
      flowRowId: "row-1",
    });
    expect(out).toEqual({
      ok: true,
      accountPlanId: "ap-1",
      requiresReview: true,
    });
  });
});
