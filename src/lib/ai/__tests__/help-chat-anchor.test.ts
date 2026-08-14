import { describe, expect, it, vi, beforeEach } from "vitest";

const findDeal = vi.fn();
const findAccount = vi.fn();
const findQuote = vi.fn();
const findLead = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: (...a: unknown[]) => findDeal(...a) },
    crmAccount: { findFirst: (...a: unknown[]) => findAccount(...a) },
    cpqQuote: { findFirst: (...a: unknown[]) => findQuote(...a) },
    crmLead: { findFirst: (...a: unknown[]) => findLead(...a) },
  },
}));

import { assertAnchorAccess, isAnchorType, pageContextToAnchor } from "../help-chat-anchor";
import type { RolePermissions } from "@/lib/permissions";

function perms(over: Partial<RolePermissions> = {}): RolePermissions {
  return {
    modules: {},
    submodules: {},
    capabilities: {},
    ...over,
  } as RolePermissions;
}

describe("anchor types", () => {
  it("acepta deal, account, quote y lead", () => {
    expect(isAnchorType("crm_deal")).toBe(true);
    expect(isAnchorType("cpq_quote")).toBe(true);
    expect(isAnchorType("crm_lead")).toBe(true);
    expect(isAnchorType("crm_account")).toBe(true);
    expect(isAnchorType("other")).toBe(false);
  });

  it("mapea pageContext a ancla", () => {
    expect(pageContextToAnchor({ entityType: "cpq_quote", entityId: "q1", entityName: "CPQ" })).toEqual({
      type: "cpq_quote",
      id: "q1",
    });
    expect(pageContextToAnchor({ entityType: "ops_guardia", entityId: "g", entityName: "x" })).toBeNull();
  });
});

describe("assertAnchorAccess", () => {
  beforeEach(() => {
    findDeal.mockReset();
    findAccount.mockReset();
    findQuote.mockReset();
    findLead.mockReset();
  });

  it("niega quote sin permiso cpq/crm.quotes", async () => {
    findQuote.mockResolvedValue({ id: "q" });
    const ok = await assertAnchorAccess("t", perms(), "cpq_quote", "q");
    expect(ok).toBe(false);
  });

  it("permite quote con canView cpq y entidad del tenant", async () => {
    findQuote.mockResolvedValue({ id: "q" });
    const ok = await assertAnchorAccess(
      "t",
      perms({ modules: { cpq: "view" } as RolePermissions["modules"] }),
      "cpq_quote",
      "q",
    );
    expect(ok).toBe(true);
    expect(findQuote).toHaveBeenCalledWith({ where: { id: "q", tenantId: "t" }, select: { id: true } });
  });

  it("niega lead de otro tenant (no existe)", async () => {
    findLead.mockResolvedValue(null);
    const ok = await assertAnchorAccess(
      "t",
      perms({ modules: { crm: "view" } as RolePermissions["modules"] }),
      "crm_lead",
      "l1",
    );
    expect(ok).toBe(false);
  });
});
