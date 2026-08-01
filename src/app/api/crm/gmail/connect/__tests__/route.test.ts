import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const requireTenantModuleMock = vi.fn();
const generateAuthUrlMock = vi.fn(() => "https://accounts.google.com/o/oauth2/auth");

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/require-module", () => ({
  requireTenantModule: (...args: unknown[]) => requireTenantModuleMock(...args),
}));
vi.mock("@/lib/crypto", () => ({
  getGmailTokenSecret: () => "test-secret-at-least-32-chars-long!!",
}));
vi.mock("@/lib/gmail", () => ({
  GMAIL_SCOPES: ["scope-a", "scope-b"],
  getGmailOAuthClient: () => ({ generateAuthUrl: generateAuthUrlMock }),
}));

describe("GET /api/crm/gmail/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantModuleMock.mockResolvedValue({ authorized: true });
    authMock.mockResolvedValue({
      user: { id: "admin-1", tenantId: "tenant-1", email: "a@gard.cl" },
    });
  });

  it("siempre inicia OAuth (reconectar no se bloquea por tope de casillas)", async () => {
    const { GET } = await import("../route");
    const req = new Request(
      "https://opai.test/api/crm/gmail/connect?return=/opai/configuracion/integraciones/gmail",
    );
    const res = await GET(req as never);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).not.toContain("limit_reached");
    expect(generateAuthUrlMock).toHaveBeenCalled();
  });
});
