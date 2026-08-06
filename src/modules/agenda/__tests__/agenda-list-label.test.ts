import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visitaFindMany: vi.fn(),
  tecnicaFindMany: vi.fn(),
  dealFindMany: vi.fn(),
  linkFindMany: vi.fn(),
  adminFindMany: vi.fn(),
  providerFindMany: vi.fn(),
  listTasks: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agendaVisita: { findMany: mocks.visitaFindMany },
    opsVisitaTecnica: { findMany: mocks.tecnicaFindMany },
    crmDeal: { findMany: mocks.dealFindMany },
    agendaEventLink: { findMany: mocks.linkFindMany },
    admin: { findMany: mocks.adminFindMany },
    calendarProviderLink: { findMany: mocks.providerFindMany },
  },
}));

vi.mock("../agenda-tasks", () => ({
  listAgendaTasks: (...a: unknown[]) => mocks.listTasks(...a),
}));

import { listAgenda } from "../agenda-list";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.linkFindMany.mockResolvedValue([]);
  mocks.adminFindMany.mockResolvedValue([{ id: "u1", name: "Ana" }]);
  mocks.providerFindMany.mockResolvedValue([]);
  mocks.dealFindMany.mockResolvedValue([]);
  mocks.listTasks.mockResolvedValue([]);
});

describe("listAgenda — label / allDay / técnicas", () => {
  it("lee label y allDay de columna", async () => {
    mocks.visitaFindMany.mockResolvedValue([
      {
        id: "v1",
        type: "otra",
        title: "Entrega de bases",
        label: "Entrega de bases",
        allDay: true,
        startAt: new Date("2026-08-10T04:00:00Z"),
        endAt: new Date("2026-08-11T03:59:00Z"),
        assignedUserId: "u1",
        account: { name: "Codelco" },
        installation: null,
        customAddress: "Av. Apoquindo 1",
        dealId: "d1",
        status: "programada",
      },
    ]);
    mocks.tecnicaFindMany.mockResolvedValue([]);

    const items = await listAgenda(
      "t1",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
    );
    expect(items[0]).toMatchObject({
      label: "Entrega de bases",
      allDay: true,
      address: "Av. Apoquindo 1",
    });
    // Un solo día Chile (10 ago 00:00 → 10 ago 23:59) → sin banda span.
    expect(items[0]?.spanKey).toBeUndefined();
  });

  it("all-day multi-día emite spanKey/spanStart/spanEnd", async () => {
    mocks.visitaFindMany.mockResolvedValue([
      {
        id: "v-multi",
        type: "otra",
        title: "Capacitación",
        label: null,
        allDay: true,
        startAt: new Date("2026-08-10T04:00:00Z"), // 00:00 Chile
        endAt: new Date("2026-08-16T03:59:00Z"), // 23:59 Chile del 15
        assignedUserId: "u1",
        account: null,
        installation: { name: "Planta", address: "Calle Inst 1" },
        customAddress: "Av. Custom 9",
        dealId: null,
        status: "programada",
      },
    ]);
    mocks.tecnicaFindMany.mockResolvedValue([]);

    const items = await listAgenda(
      "t1",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
    );
    expect(items[0]).toMatchObject({
      allDay: true,
      address: "Av. Custom 9",
      spanKey: "v-multi",
      spanStartYmd: "2026-08-10",
      spanEndYmd: "2026-08-15",
    });
  });

  it("técnicas sin syncStatus", async () => {
    mocks.visitaFindMany.mockResolvedValue([]);
    mocks.tecnicaFindMany.mockResolvedValue([
      {
        id: "vt1",
        scheduledAt: new Date("2026-08-12T15:00:00Z"),
        userId: "u1",
        user: { name: "Ana" },
        account: { name: "Codelco" },
        installation: { name: "Planta", address: null },
        dealId: null,
        status: "programada",
      },
    ]);
    mocks.linkFindMany.mockResolvedValue([
      {
        sourceType: "visita_tecnica",
        sourceId: "vt1",
        syncStatus: "SYNCED",
        rangeStartYmd: null,
        allDay: false,
        htmlLink: "https://x",
      },
    ]);

    const items = await listAgenda(
      "t1",
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-31T00:00:00Z"),
    );
    expect(items[0].source).toBe("visita_tecnica");
    expect(items[0].syncStatus).toBeNull();
  });
});
