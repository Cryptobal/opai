/**
 * Tests de RBAC + ownership para /api/agenda* (audit B1).
 *
 * Cubre:
 *  - Sin sesión → 401.
 *  - Sesión sin permiso CRM view → 403.
 *  - Módulo crm deshabilitado en tenant → 403.
 *  - GET /api/agenda con permisos → 200.
 *  - PATCH visita ajena sin rol elevado → 403.
 *  - PATCH visita propia (assignedUserId) → 200.
 *  - PATCH visita ajena como admin → 200.
 *  - DELETE visita ajena sin rol → 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
const requireCrmViewMock = vi.fn();
const requireTenantModuleMock = vi.fn();
const visitaFindFirst = vi.fn();
const linkFindUnique = vi.fn();
const reprogramMock = vi.fn();
const cancelMock = vi.fn();
const completeMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/require-module", () => ({
  requireTenantModule: requireTenantModuleMock,
}));

vi.mock("@/lib/api-auth-crm", () => ({
  requireCrmView: requireCrmViewMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaVisita: { findFirst: visitaFindFirst },
    agendaEventLink: { findUnique: linkFindUnique },
  },
}));

vi.mock("@/modules/agenda/agenda.service", () => ({
  listAgenda: vi.fn().mockResolvedValue([]),
  reprogramAgendaVisita: reprogramMock,
  cancelAgendaVisita: cancelMock,
  completeAgendaVisita: completeMock,
}));

vi.mock("@/modules/agenda/google-events", () => ({
  listGoogleCalendarEvents: vi
    .fn()
    .mockResolvedValue({ items: [], status: "ok" }),
}));

const CTX = {
  userId: "user-1",
  tenantId: "tenant-1",
  userEmail: "u@t.cl",
  userRole: "member",
};

function req(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTenantModuleMock.mockResolvedValue({ authorized: true });
  requireAuthMock.mockResolvedValue(CTX);
  requireCrmViewMock.mockResolvedValue(null);
});

describe("GET /api/agenda", () => {
  it("401 sin sesión", async () => {
    requireAuthMock.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(req("http://x/api/agenda?from=2026-07-01&to=2026-07-08"));
    expect(res.status).toBe(401);
  });

  it("403 sin permiso CRM view", async () => {
    requireCrmViewMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    );
    const { GET } = await import("../route");
    const res = await GET(req("http://x/api/agenda?from=2026-07-01&to=2026-07-08"));
    expect(res.status).toBe(403);
  });

  it("403 con módulo crm deshabilitado", async () => {
    requireTenantModuleMock.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "module off" }), { status: 403 }),
    });
    const { GET } = await import("../route");
    const res = await GET(req("http://x/api/agenda?from=2026-07-01&to=2026-07-08"));
    expect(res.status).toBe(403);
  });

  it("200 con permisos", async () => {
    const { GET } = await import("../route");
    const res = await GET(req("http://x/api/agenda?from=2026-07-01&to=2026-07-08"));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/agenda/visitas/[id] — ownership", () => {
  const patchBody = JSON.stringify({
    startAt: "2026-07-23T13:00:00.000Z",
    endAt: "2026-07-23T14:00:00.000Z",
  });

  it("403 al reprogramar visita ajena sin rol elevado", async () => {
    visitaFindFirst.mockResolvedValue({
      id: "v1",
      createdBy: "otro",
      assignedUserId: "otro-2",
      dealId: null,
    });
    const { PATCH } = await import("../visitas/[id]/route");
    const res = await PATCH(
      req("http://x/api/agenda/visitas/v1", { method: "PATCH", body: patchBody }),
      routeCtx("v1"),
    );
    expect(res.status).toBe(403);
    expect(reprogramMock).not.toHaveBeenCalled();
  });

  it("200 al reprogramar visita propia (assignedUserId)", async () => {
    visitaFindFirst.mockResolvedValue({
      id: "v1",
      createdBy: "otro",
      assignedUserId: CTX.userId,
      dealId: null,
    });
    reprogramMock.mockResolvedValue({ visita: { id: "v1" } });
    const { PATCH } = await import("../visitas/[id]/route");
    const res = await PATCH(
      req("http://x/api/agenda/visitas/v1", { method: "PATCH", body: patchBody }),
      routeCtx("v1"),
    );
    expect(res.status).toBe(200);
    expect(reprogramMock).toHaveBeenCalled();
  });

  it("200 al cancelar visita ajena como admin", async () => {
    requireAuthMock.mockResolvedValue({ ...CTX, userRole: "admin" });
    visitaFindFirst.mockResolvedValue({
      id: "v1",
      createdBy: "otro",
      assignedUserId: "otro-2",
      dealId: null,
    });
    cancelMock.mockResolvedValue({ visita: { id: "v1" } });
    const { PATCH } = await import("../visitas/[id]/route");
    const res = await PATCH(
      req("http://x/api/agenda/visitas/v1", {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      }),
      routeCtx("v1"),
    );
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalled();
  });

  it("DELETE 403 en visita ajena sin rol elevado", async () => {
    visitaFindFirst.mockResolvedValue({
      id: "v1",
      createdBy: "otro",
      assignedUserId: "otro-2",
      dealId: null,
    });
    const { DELETE } = await import("../visitas/[id]/route");
    const res = await DELETE(
      req("http://x/api/agenda/visitas/v1", { method: "DELETE" }),
      routeCtx("v1"),
    );
    expect(res.status).toBe(403);
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
