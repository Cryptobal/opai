import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFindFirst: vi.fn(),
  adminFindMany: vi.fn(),
  accountFindFirst: vi.fn(),
  installationFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  visitaCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findFirst: mocks.adminFindFirst, findMany: mocks.adminFindMany },
    crmAccount: { findFirst: mocks.accountFindFirst },
    crmInstallation: { findFirst: mocks.installationFindFirst },
    crmDeal: { findFirst: mocks.dealFindFirst },
    crmContact: { findMany: mocks.contactFindMany },
    agendaVisita: { create: mocks.visitaCreate },
  },
}));

vi.mock("../calendar-mapper", () => ({ mirrorVisitaToV2: vi.fn() }));
vi.mock("../calendar-participants", () => ({
  addEventParticipants: vi.fn(),
  removeEventParticipant: vi.fn(),
  setEventOwner: vi.fn(),
}));
vi.mock("../calendar-google-sync", () => ({
  syncCalendarEventToGoogle: vi.fn().mockResolvedValue({ syncStatus: "SYNCED" }),
}));
vi.mock("../calendar-notify", () => ({ notifyCalendarEvent: vi.fn() }));
vi.mock("../calendar-audit", () => ({ recordCalendarAudit: vi.fn() }));

import { createOpaiEvent, OpaiEventValidationError } from "../calendar-write";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminFindFirst.mockResolvedValue({ id: "owner" });
  mocks.adminFindMany.mockResolvedValue([{ id: "p1", email: "p1@x.cl" }]);
  mocks.accountFindFirst.mockResolvedValue({ id: "acc1" });
  mocks.installationFindFirst.mockResolvedValue({ id: "inst1", accountId: "acc1" });
  mocks.dealFindFirst.mockResolvedValue({ id: "deal1", accountId: "acc1" });
  mocks.contactFindMany.mockResolvedValue([]);
});

describe("createOpaiEvent — tenant isolation", () => {
  const base = {
    tenantId: "t1",
    actorUserId: "actor",
    title: "Evento",
    assignedUserId: "owner",
    startAt: new Date("2026-08-10T13:00:00Z"),
    endAt: new Date("2026-08-10T14:00:00Z"),
  };

  it("accountId ajeno → 400 sin escritura", async () => {
    mocks.accountFindFirst.mockResolvedValue(null);
    await expect(
      createOpaiEvent({ ...base, accountId: "x" }),
    ).rejects.toMatchObject({ name: "OpaiEventValidationError", status: 400 });
    expect(mocks.visitaCreate).not.toHaveBeenCalled();
  });

  it("dealId ajeno → 400 sin escritura", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    await expect(
      createOpaiEvent({ ...base, dealId: "x" }),
    ).rejects.toBeInstanceOf(OpaiEventValidationError);
    expect(mocks.visitaCreate).not.toHaveBeenCalled();
  });

  it("installationId ajeno → 400 sin escritura", async () => {
    mocks.installationFindFirst.mockResolvedValue(null);
    await expect(
      createOpaiEvent({ ...base, installationId: "x" }),
    ).rejects.toBeInstanceOf(OpaiEventValidationError);
    expect(mocks.visitaCreate).not.toHaveBeenCalled();
  });

  it("participantIds ajenos → 400 sin escritura", async () => {
    mocks.adminFindMany.mockResolvedValue([]); // ninguno del tenant
    await expect(
      createOpaiEvent({ ...base, participantIds: ["foreign"] }),
    ).rejects.toBeInstanceOf(OpaiEventValidationError);
    expect(mocks.visitaCreate).not.toHaveBeenCalled();
  });
});
