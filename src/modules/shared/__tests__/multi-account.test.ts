/**
 * Tests de resolveMultiAccount: flags, tope y regla de escape por conteo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isTenantFeatureFlagEnabled: vi.fn(),
  crmEmailAccountCount: vi.fn(),
  googleCalendarAccountCount: vi.fn(),
}));

vi.mock("@/lib/tenant-modules", () => ({
  isTenantFeatureFlagEnabled: mocks.isTenantFeatureFlagEnabled,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: { count: mocks.crmEmailAccountCount },
    googleCalendarAccount: { count: mocks.googleCalendarAccountCount },
  },
}));

import { resolveMultiAccount } from "../multi-account";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveMultiAccount — correo", () => {
  it("flag off + 0 cuentas → enabled false, canConnect true, max 1", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(false);
    mocks.crmEmailAccountCount.mockResolvedValue(0);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "correo",
    });
    expect(state).toMatchObject({
      enabled: false,
      flagEnabled: false,
      canConnect: true,
      maxAccounts: 1,
      connectedCount: 0,
    });
  });

  it("flag off + 1 cuenta → enabled false, canConnect false, max 1", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(false);
    mocks.crmEmailAccountCount.mockResolvedValue(1);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "correo",
    });
    expect(state).toMatchObject({
      enabled: false,
      flagEnabled: false,
      canConnect: false,
      maxAccounts: 1,
      connectedCount: 1,
    });
  });

  it("flag off + 2 cuentas → escape activo, canConnect false", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(false);
    mocks.crmEmailAccountCount.mockResolvedValue(2);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "correo",
    });
    expect(state).toMatchObject({
      enabled: true,
      flagEnabled: false,
      canConnect: false,
      maxAccounts: 1,
      connectedCount: 2,
    });
  });

  it("flag on + 1 cuenta → enabled true, canConnect true, max 5", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(true);
    mocks.crmEmailAccountCount.mockResolvedValue(1);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "correo",
    });
    expect(state).toMatchObject({
      enabled: true,
      flagEnabled: true,
      canConnect: true,
      maxAccounts: 5,
      connectedCount: 1,
    });
  });

  it("flag on + 5 cuentas → canConnect false", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(true);
    mocks.crmEmailAccountCount.mockResolvedValue(5);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "correo",
    });
    expect(state).toMatchObject({
      enabled: true,
      flagEnabled: true,
      canConnect: false,
      maxAccounts: 5,
      connectedCount: 5,
    });
  });
});

describe("resolveMultiAccount — agenda", () => {
  it("flag off + 1 cuenta → canConnect false; cuenta Google ACTIVE", async () => {
    mocks.isTenantFeatureFlagEnabled.mockResolvedValue(false);
    mocks.googleCalendarAccountCount.mockResolvedValue(1);
    const state = await resolveMultiAccount({
      tenantId: "t1",
      userId: "u1",
      scope: "agenda",
    });
    expect(state.canConnect).toBe(false);
    expect(state.maxAccounts).toBe(1);
    expect(mocks.googleCalendarAccountCount).toHaveBeenCalled();
    expect(mocks.crmEmailAccountCount).not.toHaveBeenCalled();
  });
});
