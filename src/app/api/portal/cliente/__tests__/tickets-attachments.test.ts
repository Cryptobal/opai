/**
 * Tests de integración para tickets con adjuntos (PR5).
 *
 * Cubre:
 *  - POST /tickets con attachments → crea ticket Y un comment inicial con attachments.
 *  - POST /tickets/[id]/comments con attachments → 201 + attachments persistidos.
 *  - POST /tickets/[id]/comments con ticket interno → 404 (no portal_cliente).
 *  - POST /tickets/[id]/comments exige mensaje o adjunto.
 *  - 401 sin sesión en ambos endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const ticketCreate = vi.fn();
const ticketFindFirst = vi.fn();
const commentCreate = vi.fn();
const installationFindFirst = vi.fn();
const contactFindUnique = vi.fn();
const ticketTypeFindFirst = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "portal_cliente_session" ? { value: "fake-signed-cookie" } : undefined,
  })),
}));
vi.mock("@/lib/cookie-signature", () => ({
  verifyCookie: vi.fn(() =>
    JSON.stringify({
      contactId: "contact-1",
      tenantId: "tenant-A",
      accountId: "acc-A",
      installations: [{ id: "inst-1", name: "Sede" }],
    }),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: { findUnique: contactFindUnique },
    crmInstallation: { findFirst: installationFindFirst },
    opsTicket: { create: ticketCreate, findFirst: ticketFindFirst },
    opsTicketComment: { create: commentCreate },
    opsTicketType: { findFirst: ticketTypeFindFirst },
  },
}));

// Evitamos efectos secundarios de email / notifications en los tests.
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({}) } },
  getTenantEmailConfig: vi.fn().mockResolvedValue({
    from: "tickets@opai.cl",
    logoUrl: null,
    companyName: "OPAI",
  }),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notify: vi.fn().mockResolvedValue({ delivered: 0 }),
}));

function makeRequest(url: string, body?: unknown): unknown {
  const u = new URL(url);
  return {
    url,
    nextUrl: { searchParams: u.searchParams },
    headers: new Map<string, string>(),
    json: async () => body,
  };
}

beforeEach(() => {
  ticketCreate.mockReset();
  ticketFindFirst.mockReset();
  commentCreate.mockReset();
  installationFindFirst.mockReset();
  contactFindUnique.mockReset();
  ticketTypeFindFirst.mockReset();
  contactFindUnique.mockResolvedValue({
    id: "contact-1",
    tenantId: "tenant-A",
    accountId: "acc-A",
    firstName: "Ana",
    lastName: "Cliente",
    email: "ana@acme.cl",
    portalEnabled: true,
    account: {
      status: "client_active",
      isActive: true,
      installations: [{ id: "inst-1" }],
    },
  });
});

describe("POST /api/portal/cliente/tickets with attachments", () => {
  it("401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { POST } = await import("../tickets/route");
    const res = await POST(
      makeRequest("http://x/api/portal/cliente/tickets", {
        installationId: "inst-1",
        title: "Hola",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it("crea el ticket y un comment inicial con los attachments", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    ticketCreate.mockResolvedValue({
      id: "ticket-1",
      code: "TKT-ABC",
      status: "open",
      priority: "p3",
      title: "Cámara dañada",
      description: null,
      assignedTeam: "operaciones",
      installationId: "inst-1",
      source: "portal_cliente",
      createdAt: new Date(),
      ticketType: null,
    });
    commentCreate.mockResolvedValue({ id: "comm-1" });

    const { POST } = await import("../tickets/route");
    const res = await POST(
      makeRequest("http://x/api/portal/cliente/tickets", {
        installationId: "inst-1",
        title: "Cámara dañada",
        description: "Se ve borrosa",
        priority: "p2",
        attachments: [
          {
            id: "att-1",
            fileName: "foto.jpg",
            fileUrl: "https://cdn/foto.jpg",
            fileType: "image/jpeg",
            fileSize: 120_000,
          },
          {
            id: "att-2",
            fileName: "informe.pdf",
            fileUrl: "javascript:alert(1)", // debe ser descartado
            fileType: "application/pdf",
            fileSize: 50_000,
          },
        ],
      }) as Parameters<typeof POST>[0],
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("ticket-1");

    // El comment inicial se creó con los attachments normalizados.
    expect(commentCreate).toHaveBeenCalledOnce();
    const createArg = commentCreate.mock.calls[0][0];
    expect(createArg.data.ticketId).toBe("ticket-1");
    expect(createArg.data.isInternal).toBe(false);
    expect(createArg.data.userId).toBe("contact-1");
    expect(createArg.data.attachments).toHaveLength(1); // el javascript: fue filtrado
    expect(createArg.data.attachments[0].id).toBe("att-1");
  });

  it("no crea comment inicial si no hay attachments", async () => {
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    ticketCreate.mockResolvedValue({
      id: "ticket-2",
      code: "TKT-X",
      status: "open",
      priority: "p3",
      title: "Consulta",
      description: null,
      assignedTeam: "operaciones",
      installationId: "inst-1",
      source: "portal_cliente",
      createdAt: new Date(),
      ticketType: null,
    });

    const { POST } = await import("../tickets/route");
    await POST(
      makeRequest("http://x/api/portal/cliente/tickets", {
        installationId: "inst-1",
        title: "Consulta",
      }) as Parameters<typeof POST>[0],
    );
    expect(commentCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/portal/cliente/tickets/[id]/comments with attachments", () => {
  it("401 sin sesión", async () => {
    const { cookies } = await import("next/headers");
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      get: () => undefined,
    });
    const { POST } = await import("../tickets/[id]/comments/route");
    const res = await POST(
      makeRequest("http://x/api/portal/cliente/tickets/t/comments", {
        body: "hola",
      }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: "t" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404 cuando el ticket es interno (source != portal_cliente)", async () => {
    ticketFindFirst.mockResolvedValue(null);
    const { POST } = await import("../tickets/[id]/comments/route");
    const res = await POST(
      makeRequest(
        "http://x/api/portal/cliente/tickets/ticket-interno/comments",
        { body: "hola" },
      ) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: "ticket-interno" }) },
    );
    expect(res.status).toBe(404);
    expect(commentCreate).not.toHaveBeenCalled();
    // Verificar que el filtro incluye source: portal_cliente y tenantId.
    expect(ticketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "ticket-interno",
          tenantId: "tenant-A",
          source: "portal_cliente",
        }),
      }),
    );
  });

  it("400 si no hay mensaje ni attachments", async () => {
    ticketFindFirst.mockResolvedValue({
      id: "t1",
      installationId: "inst-1",
      code: "TKT-1",
      title: "x",
      assignedTo: null,
      assignedTeam: "operaciones",
    });
    installationFindFirst.mockResolvedValue({ id: "inst-1" });

    const { POST } = await import("../tickets/[id]/comments/route");
    const res = await POST(
      makeRequest("http://x/api/portal/cliente/tickets/t1/comments", {
        body: "   ",
      }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: "t1" }) },
    );
    expect(res.status).toBe(400);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("crea comment con attachments normalizados", async () => {
    ticketFindFirst.mockResolvedValue({
      id: "t1",
      installationId: "inst-1",
      code: "TKT-1",
      title: "Cámara",
      assignedTo: null,
      assignedTeam: "operaciones",
    });
    installationFindFirst.mockResolvedValue({ id: "inst-1" });
    commentCreate.mockResolvedValue({
      id: "comm-1",
      ticketId: "t1",
      userId: "contact-1",
      body: "Archivos adjuntos (1)",
      isInternal: false,
      attachments: [],
      createdAt: new Date(),
    });

    const { POST } = await import("../tickets/[id]/comments/route");
    const res = await POST(
      makeRequest("http://x/api/portal/cliente/tickets/t1/comments", {
        body: "",
        attachments: [
          {
            id: "att-1",
            fileName: "ev.jpg",
            fileUrl: "https://cdn/ev.jpg",
            fileType: "image/jpeg",
            fileSize: 1024,
          },
        ],
      }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: "t1" }) },
    );
    expect(res.status).toBe(201);
    expect(commentCreate).toHaveBeenCalledOnce();
    const arg = commentCreate.mock.calls[0][0];
    expect(arg.data.ticketId).toBe("t1");
    expect(arg.data.userId).toBe("contact-1");
    expect(arg.data.attachments).toHaveLength(1);
    expect(arg.data.attachments[0].fileUrl).toBe("https://cdn/ev.jpg");
    // Cuando el body está vacío pero hay adjuntos, se genera uno por defecto.
    expect(arg.data.body).toMatch(/Archivos adjuntos/);
  });
});
