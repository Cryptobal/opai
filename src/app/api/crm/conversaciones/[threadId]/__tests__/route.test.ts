/**
 * Autorización POR ENTIDAD del lector de hilos en la ficha (Bloque 5). Nunca
 * debe confiar en entityType/entityId del cliente sin cruzarlos contra la
 * asociación real del hilo, ni exponer hilos privados o de otro tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveApiPerms: vi.fn(),
  canView: vi.fn(),
  canViewInstallations: vi.fn(),
  threadFindFirst: vi.fn(),
  linkFindFirst: vi.fn(),
  getEntityThreadDetail: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
  resolveApiPerms: mocks.resolveApiPerms,
}));
vi.mock("@/lib/permissions", () => ({
  canView: mocks.canView,
  canViewInstallations: mocks.canViewInstallations,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: mocks.threadFindFirst },
    crmEmailThreadLink: { findFirst: mocks.linkFindFirst },
  },
}));
vi.mock("@/modules/crm/email/entity-thread", () => ({
  getEntityThreadDetail: mocks.getEntityThreadDetail,
}));

const { GET } = await import("../route");

function req(entityType: string, entityId: string) {
  return new NextRequest(
    `http://localhost/api/crm/conversaciones/thr-1?entityType=${entityType}&entityId=${entityId}`,
  );
}
const ctx = { params: Promise.resolve({ threadId: "thr-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ tenantId: "t1", userId: "u1" });
  mocks.resolveApiPerms.mockResolvedValue({});
  mocks.canView.mockReturnValue(true);
  mocks.canViewInstallations.mockReturnValue(true);
  mocks.getEntityThreadDetail.mockResolvedValue({ thread: { id: "thr-1", subject: "S" }, messages: [], attachments: [], synced: true });
});

describe("GET conversaciones/[threadId] — autorización por entidad", () => {
  it("cuenta asociada + compartida + permiso → 200 con el detalle del espejo", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: "acc-1", dealId: null, sharedWithAccount: true, attachmentsMeta: null });
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(200);
    expect(mocks.getEntityThreadDetail).toHaveBeenCalledTimes(1);
  });

  it("hilo NO asociado a la entidad reclamada → 403 (no confía en entityId del cliente)", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: "acc-OTRA", dealId: null, sharedWithAccount: true, attachmentsMeta: null });
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(403);
    expect(mocks.getEntityThreadDetail).not.toHaveBeenCalled();
  });

  it("hilo privado (sharedWithAccount=false) → 403", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: "acc-1", dealId: null, sharedWithAccount: false, attachmentsMeta: null });
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(403);
  });

  it("otro tenant (findFirst filtra por tenantId → null) → 404", async () => {
    mocks.threadFindFirst.mockResolvedValue(null);
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(404);
  });

  it("sin permiso de módulo sobre la cuenta → 403", async () => {
    mocks.canView.mockReturnValue(false);
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: "acc-1", dealId: null, sharedWithAccount: true, attachmentsMeta: null });
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(403);
  });

  it("negocio asociado + compartido → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: "acc-1", dealId: "deal-1", sharedWithAccount: true, attachmentsMeta: null });
    const res = await GET(req("deal", "deal-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("instalación con link visible → 200; sin link → 403", async () => {
    mocks.threadFindFirst.mockResolvedValue({ id: "thr-1", subject: "S", accountId: null, dealId: null, sharedWithAccount: false, attachmentsMeta: null });
    mocks.linkFindFirst.mockResolvedValueOnce({ id: "link-1" });
    expect((await GET(req("installation", "inst-1"), ctx)).status).toBe(200);
    mocks.linkFindFirst.mockResolvedValueOnce(null);
    expect((await GET(req("installation", "inst-1"), ctx)).status).toBe(403);
  });

  it("entityType inválido → 400", async () => {
    const res = await GET(req("lead", "x"), ctx);
    expect(res.status).toBe(400);
  });
});
