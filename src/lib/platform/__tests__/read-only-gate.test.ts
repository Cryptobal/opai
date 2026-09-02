// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isTenantReadOnlyWriteAllowed } from "@/lib/platform/read-only-gate";

describe("isTenantReadOnlyWriteAllowed", () => {
  it("permite auth, plan, upgrade-request, health y platform", () => {
    expect(isTenantReadOnlyWriteAllowed("/api/auth/session")).toBe(true);
    expect(isTenantReadOnlyWriteAllowed("/api/tenant/plan")).toBe(true);
    expect(isTenantReadOnlyWriteAllowed("/api/tenant/plan/upgrade-request")).toBe(true);
    expect(isTenantReadOnlyWriteAllowed("/api/health")).toBe(true);
    expect(isTenantReadOnlyWriteAllowed("/api/platform/tenants")).toBe(true);
  });

  it("bloquea APIs operativas", () => {
    expect(isTenantReadOnlyWriteAllowed("/api/ops/pauta")).toBe(false);
    expect(isTenantReadOnlyWriteAllowed("/api/crm/accounts")).toBe(false);
  });
});
