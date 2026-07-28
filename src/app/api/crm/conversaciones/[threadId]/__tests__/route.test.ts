/**
 * Autorización POR ENTIDAD del lector de hilos en la ficha.
 * Replica las reglas del listado (directos + heredados) vía authorizeEntityThread.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveApiPerms: vi.fn(),
  canView: vi.fn(),
  canViewInstallations: vi.fn(),
  canEdit: vi.fn(),
  threadFindFirst: vi.fn(),
  linkFindFirst: vi.fn(),
  bridgeFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
  dealQuoteFindMany: vi.fn(),
  installationFindFirst: vi.fn(),
  quoteFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  getEntityThreadDetail: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
  resolveApiPerms: mocks.resolveApiPerms,
}));
vi.mock("@/lib/permissions", () => ({
  canView: mocks.canView,
  canViewInstallations: mocks.canViewInstallations,
  canEdit: mocks.canEdit,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: mocks.threadFindFirst },
    crmEmailThreadLink: { findFirst: mocks.linkFindFirst },
    crmEmailThreadContact: { findFirst: mocks.bridgeFindFirst },
    crmContact: { findFirst: mocks.contactFindFirst },
    crmDeal: { findFirst: mocks.dealFindFirst },
    crmDealQuote: { findMany: mocks.dealQuoteFindMany },
    crmInstallation: { findFirst: mocks.installationFindFirst },
    cpqQuote: { findFirst: mocks.quoteFindFirst },
    crmEmailAccount: { findFirst: mocks.accountFindFirst },
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

function baseThread(overrides: Record<string, unknown> = {}) {
  return {
    id: "thr-1",
    subject: "S",
    accountId: "acc-1",
    dealId: null as string | null,
    contactId: null as string | null,
    emailAccountId: "ea-1",
    sharedWithAccount: true,
    attachmentsMeta: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ tenantId: "t1", userId: "u1" });
  mocks.resolveApiPerms.mockResolvedValue({});
  mocks.canView.mockReturnValue(true);
  mocks.canViewInstallations.mockReturnValue(true);
  mocks.canEdit.mockReturnValue(true);
  mocks.accountFindFirst.mockResolvedValue({ email: "yo@gard.cl", userId: "u1" });
  mocks.dealQuoteFindMany.mockResolvedValue([]);
  mocks.bridgeFindFirst.mockResolvedValue(null);
  mocks.contactFindFirst.mockResolvedValue(null);
  mocks.dealFindFirst.mockResolvedValue(null);
  mocks.installationFindFirst.mockResolvedValue(null);
  mocks.quoteFindFirst.mockResolvedValue(null);
  mocks.linkFindFirst.mockResolvedValue(null);
  mocks.getEntityThreadDetail.mockResolvedValue({
    thread: { id: "thr-1", subject: "S", accountId: "acc-1", dealId: null, contactId: null },
    messages: [],
    attachments: [],
    synced: true,
  });
});

describe("GET conversaciones/[threadId] — autorización por entidad", () => {
  it("cuenta asociada + compartida + permiso → 200 con el detalle del espejo", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread());
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canReply).toBe(true);
    expect(body.ownerEmail).toBe("yo@gard.cl");
    expect(mocks.getEntityThreadDetail).toHaveBeenCalledTimes(1);
  });

  it("hilo NO asociado a la entidad reclamada → 403 (no confía en entityId del cliente)", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ accountId: "acc-OTRA" }));
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(403);
    expect(mocks.getEntityThreadDetail).not.toHaveBeenCalled();
  });

  it("hilo privado (sharedWithAccount=false) → 403", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ sharedWithAccount: false }));
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
    mocks.threadFindFirst.mockResolvedValue(baseThread());
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(403);
  });

  it("negocio asociado + compartido → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ dealId: "deal-1" }));
    const res = await GET(req("deal", "deal-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("negocio con hilo de cotización vinculada → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(
      baseThread({ dealId: null, accountId: null, sharedWithAccount: false }),
    );
    mocks.dealQuoteFindMany.mockResolvedValue([{ quoteId: "q1" }]);
    mocks.linkFindFirst.mockResolvedValue({ id: "link-1" });
    const res = await GET(req("deal", "deal-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("negocio heredado de la cuenta → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ dealId: null, accountId: "acc-1" }));
    mocks.dealQuoteFindMany.mockResolvedValue([]);
    mocks.dealFindFirst.mockResolvedValue({ accountId: "acc-1" });
    const res = await GET(req("deal", "deal-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("instalación con link visible → 200; sin link ni herencia → 403", async () => {
    mocks.threadFindFirst.mockResolvedValue(
      baseThread({ accountId: null, sharedWithAccount: false }),
    );
    mocks.linkFindFirst.mockResolvedValueOnce({ id: "link-1" });
    expect((await GET(req("installation", "inst-1"), ctx)).status).toBe(200);
    mocks.linkFindFirst.mockResolvedValueOnce(null);
    mocks.installationFindFirst.mockResolvedValueOnce({ accountId: null });
    expect((await GET(req("installation", "inst-1"), ctx)).status).toBe(403);
  });

  it("instalación heredada de la cuenta → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ accountId: "acc-1" }));
    mocks.linkFindFirst.mockResolvedValue(null);
    mocks.installationFindFirst.mockResolvedValue({ accountId: "acc-1" });
    const res = await GET(req("installation", "inst-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("cotización heredada del negocio → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(
      baseThread({ dealId: "deal-1", accountId: "acc-1" }),
    );
    mocks.linkFindFirst.mockResolvedValue(null);
    mocks.quoteFindFirst.mockResolvedValue({ dealId: "deal-1", accountId: "acc-1" });
    const res = await GET(req("quote", "q1"), ctx);
    expect(res.status).toBe(200);
  });

  it("cotización heredada de la cuenta cuando dealId es null → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread({ dealId: null, accountId: "acc-1" }));
    mocks.linkFindFirst.mockResolvedValue(null);
    mocks.quoteFindFirst.mockResolvedValue({ dealId: null, accountId: "acc-1" });
    const res = await GET(req("quote", "q1"), ctx);
    expect(res.status).toBe(200);
  });

  it("cotización con dealId presente y hilo de otra cuenta/negocio → 403", async () => {
    mocks.threadFindFirst.mockResolvedValue(
      baseThread({ dealId: "deal-OTRO", accountId: "acc-1" }),
    );
    mocks.linkFindFirst.mockResolvedValue(null);
    mocks.quoteFindFirst.mockResolvedValue({ dealId: "deal-1", accountId: "acc-1" });
    const res = await GET(req("quote", "q1"), ctx);
    expect(res.status).toBe(403);
  });

  it("contacto heredado de la cuenta → 200", async () => {
    mocks.threadFindFirst.mockResolvedValue(
      baseThread({ contactId: null, accountId: "acc-1" }),
    );
    mocks.bridgeFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue({ accountId: "acc-1" });
    const res = await GET(req("contact", "ct-1"), ctx);
    expect(res.status).toBe(200);
  });

  it("casilla de otro usuario → canReply false con ownerEmail del dueño", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread());
    mocks.accountFindFirst.mockResolvedValue({ email: "carlos@gard.cl", userId: "u-otro" });
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canReply).toBe(false);
    expect(body.ownerEmail).toBe("carlos@gard.cl");
  });

  it("casilla propia sin permiso de escritura → canReply false sin nota de dueño", async () => {
    mocks.threadFindFirst.mockResolvedValue(baseThread());
    mocks.accountFindFirst.mockResolvedValue({ email: "yo@gard.cl", userId: "u1" });
    mocks.canEdit.mockReturnValue(false);
    const res = await GET(req("account", "acc-1"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canReply).toBe(false);
    expect(body.ownerEmail).toBeNull();
  });

  it("entityType inválido → 400", async () => {
    const res = await GET(req("lead", "x"), ctx);
    expect(res.status).toBe(400);
  });
});
