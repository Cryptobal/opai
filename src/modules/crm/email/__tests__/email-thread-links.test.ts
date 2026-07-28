/**
 * Vinculación polimórfica (O01-O04): validación de tipos, existencia
 * tenant-scoped y resolución con aislamiento (cero fugas cross-tenant).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  installationFindFirst: vi.fn(),
  installationFindMany: vi.fn(),
  guardiaFindFirst: vi.fn(),
  supplierFindFirst: vi.fn(),
  dteFindFirst: vi.fn(),
  ticketFindFirst: vi.fn(),
  quoteFindMany: vi.fn(),
  linkFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmInstallation: {
      findFirst: mocks.installationFindFirst,
      findMany: mocks.installationFindMany,
    },
    opsGuardia: { findFirst: mocks.guardiaFindFirst },
    financeSupplier: { findFirst: mocks.supplierFindFirst },
    financeDte: { findFirst: mocks.dteFindFirst },
    opsTicket: { findFirst: mocks.ticketFindFirst },
    cpqQuote: { findMany: mocks.quoteFindMany },
    crmEmailThreadLink: { findMany: mocks.linkFindMany },
  },
}));

import {
  isThreadLinkEntityType,
  resolveThreadLinks,
  threadLinkEntityExists,
  THREAD_LINK_ENTITY_TYPES,
  THREAD_LINK_TYPE_LABELS,
} from "../email-thread-links";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isThreadLinkEntityType", () => {
  it("acepta los 6 tipos y rechaza cualquier otro", () => {
    for (const t of ["installation", "guardia", "postulante", "proveedor", "factura", "incidente"]) {
      expect(isThreadLinkEntityType(t)).toBe(true);
    }
    expect(isThreadLinkEntityType("lead")).toBe(false);
    expect(isThreadLinkEntityType("")).toBe(false);
  });
});

describe("THREAD_LINK_TYPE_LABELS", () => {
  it("cubre los 10 tipos con etiqueta en español", () => {
    expect(Object.keys(THREAD_LINK_TYPE_LABELS)).toHaveLength(THREAD_LINK_ENTITY_TYPES.length);
    for (const t of THREAD_LINK_ENTITY_TYPES) {
      expect(THREAD_LINK_TYPE_LABELS[t].length).toBeGreaterThan(0);
    }
    expect(THREAD_LINK_TYPE_LABELS.ops_ticket).toBe("Ticket");
    expect(THREAD_LINK_TYPE_LABELS.calendar_event).toBe("Evento de agenda");
    expect(THREAD_LINK_TYPE_LABELS.quote).toBe("Cotización");
  });
});

describe("threadLinkEntityExists — aislamiento tenant", () => {
  it("la validación de instalación filtra por tenantId", async () => {
    mocks.installationFindFirst.mockResolvedValue(null);
    const exists = await threadLinkEntityExists({
      tenantId: "t1",
      type: "installation",
      entityId: "inst-otro-tenant",
    });
    expect(exists).toBe(false);
    expect(mocks.installationFindFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: "t1",
      id: "inst-otro-tenant",
    });
  });

  it("factura e incidente también validan tenant", async () => {
    mocks.dteFindFirst.mockResolvedValue({ id: "f1" });
    await threadLinkEntityExists({ tenantId: "t1", type: "factura", entityId: "f1" });
    expect(mocks.dteFindFirst.mock.calls[0][0].where.tenantId).toBe("t1");
    mocks.ticketFindFirst.mockResolvedValue(null);
    await threadLinkEntityExists({ tenantId: "t1", type: "incidente", entityId: "tk1" });
    expect(mocks.ticketFindFirst.mock.calls[0][0].where.tenantId).toBe("t1");
  });
});

describe("resolveThreadLinks", () => {
  it("resuelve labels/estado por tenant y arma deep-links", async () => {
    mocks.linkFindMany.mockResolvedValue([
      {
        id: "l1",
        entityType: "installation",
        entityId: "i1",
        linkedVia: "ai",
        visibleOnEntity: true,
        createdAt: new Date(),
      },
    ]);
    mocks.installationFindMany.mockResolvedValue([
      { id: "i1", name: "Bodega Quilicura", status: "active" },
    ]);
    const links = await resolveThreadLinks({ tenantId: "t1", threadId: "th1" });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      label: "Bodega Quilicura",
      status: "active",
      linkedVia: "ai",
      href: "/crm/installations/i1",
      visibleOnEntity: true,
      orphan: false,
    });
    expect(mocks.linkFindMany.mock.calls[0][0].where.tenantId).toBe("t1");
    expect(mocks.installationFindMany.mock.calls[0][0].where).toMatchObject({
      tenantId: "t1",
      id: { in: ["i1"] },
    });
  });

  it("marca orphan cuando la entidad no existe", async () => {
    mocks.linkFindMany.mockResolvedValue([
      {
        id: "l-orphan",
        entityType: "quote",
        entityId: "q-gone",
        linkedVia: "ai",
        visibleOnEntity: true,
        createdAt: new Date(),
      },
    ]);
    mocks.quoteFindMany.mockResolvedValue([]);
    const links = await resolveThreadLinks({ tenantId: "t1", threadId: "th1" });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      orphan: true,
      href: null,
      label: "Entidad eliminada",
      entityId: "q-gone",
    });
  });

  it("tipos desconocidos persistidos se ignoran (no rompen el panel)", async () => {
    mocks.linkFindMany.mockResolvedValue([
      {
        id: "l2",
        entityType: "alien",
        entityId: "x",
        linkedVia: "manual",
        visibleOnEntity: true,
        createdAt: new Date(),
      },
    ]);
    const links = await resolveThreadLinks({ tenantId: "t1", threadId: "th1" });
    expect(links).toHaveLength(0);
  });
});
