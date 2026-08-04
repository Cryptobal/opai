import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFindFirst: vi.fn(),
  adminFindMany: vi.fn(),
  accountFindFirst: vi.fn(),
  installationFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  visitaCreate: vi.fn(),
  visitaFindFirst: vi.fn(),
  visitaUpdate: vi.fn(),
  eventUpdateMany: vi.fn(),
  participantFindMany: vi.fn(),
  participantDeleteMany: vi.fn(),
  externalUpsert: vi.fn(),
  externalFindMany: vi.fn(),
  externalDeleteMany: vi.fn(),
  reminderFindMany: vi.fn(),
  reminderCreate: vi.fn(),
  reminderDeleteMany: vi.fn(),
  providerFindFirst: vi.fn(),
  linkFindUnique: vi.fn(),
  addParticipants: vi.fn(),
  removeParticipant: vi.fn(),
  setOwner: vi.fn(),
  mirror: vi.fn(),
  syncGoogle: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findFirst: mocks.adminFindFirst, findMany: mocks.adminFindMany },
    crmAccount: { findFirst: mocks.accountFindFirst },
    crmInstallation: { findFirst: mocks.installationFindFirst },
    crmDeal: { findFirst: mocks.dealFindFirst },
    crmContact: { findMany: mocks.contactFindMany },
    agendaVisita: {
      create: mocks.visitaCreate,
      findFirst: mocks.visitaFindFirst,
      update: mocks.visitaUpdate,
    },
    calendarEvent: { updateMany: mocks.eventUpdateMany },
    calendarEventParticipant: {
      findMany: mocks.participantFindMany,
      deleteMany: mocks.participantDeleteMany,
    },
    calendarExternalAttendee: {
      upsert: mocks.externalUpsert,
      findMany: mocks.externalFindMany,
      deleteMany: mocks.externalDeleteMany,
    },
    calendarEventReminder: {
      findMany: mocks.reminderFindMany,
      create: mocks.reminderCreate,
      deleteMany: mocks.reminderDeleteMany,
    },
    calendarProviderLink: { findFirst: mocks.providerFindFirst },
    agendaEventLink: { findUnique: mocks.linkFindUnique },
  },
}));

vi.mock("../calendar-mapper", () => ({
  mirrorVisitaToV2: (...a: unknown[]) => mocks.mirror(...a),
}));
vi.mock("../calendar-participants", () => ({
  addEventParticipants: (...a: unknown[]) => mocks.addParticipants(...a),
  removeEventParticipant: (...a: unknown[]) => mocks.removeParticipant(...a),
  setEventOwner: (...a: unknown[]) => mocks.setOwner(...a),
}));
vi.mock("../calendar-google-sync", () => ({
  syncCalendarEventToGoogle: (...a: unknown[]) => mocks.syncGoogle(...a),
}));
vi.mock("../calendar-notify", () => ({
  notifyCalendarEvent: (...a: unknown[]) => mocks.notify(...a),
}));
vi.mock("../calendar-audit", () => ({
  recordCalendarAudit: (...a: unknown[]) => mocks.audit(...a),
}));

import {
  createOpaiEvent,
  OpaiEventValidationError,
  updateOpaiEvent,
} from "../calendar-write";

const BASE = {
  tenantId: "t1",
  actorUserId: "actor",
  title: "Visita Codelco",
  assignedUserId: "owner",
  startAt: new Date("2026-08-10T13:00:00Z"),
  endAt: new Date("2026-08-10T14:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminFindFirst.mockResolvedValue({ id: "owner" });
  mocks.adminFindMany.mockImplementation(async ({ where }) => {
    const ids: string[] = where?.id?.in ?? [];
    return ids.map((id) => ({ id, email: `${id}@gard.cl` }));
  });
  mocks.accountFindFirst.mockResolvedValue({ id: "acc1" });
  mocks.installationFindFirst.mockResolvedValue({ id: "inst1", accountId: "acc1" });
  mocks.dealFindFirst.mockResolvedValue({ id: "deal1", accountId: "acc1" });
  mocks.contactFindMany.mockResolvedValue([]);
  mocks.visitaCreate.mockImplementation(async ({ data }) => ({
    ...data,
    id: "ev-1",
    label: data.label ?? null,
    status: "programada",
  }));
  mocks.mirror.mockResolvedValue(undefined);
  mocks.addParticipants.mockResolvedValue(undefined);
  mocks.syncGoogle.mockResolvedValue({ syncStatus: "SYNCED" });
  mocks.notify.mockResolvedValue({ delivered: 1 });
  mocks.audit.mockResolvedValue(undefined);
  mocks.eventUpdateMany.mockResolvedValue({ count: 1 });
  mocks.reminderFindMany.mockResolvedValue([]);
  mocks.providerFindFirst.mockResolvedValue({
    htmlLink: "https://calendar.google.com/event?eid=x",
  });
  mocks.linkFindUnique.mockResolvedValue(null);
  mocks.externalUpsert.mockResolvedValue({});
  mocks.participantFindMany.mockResolvedValue([]);
  mocks.externalFindMany.mockResolvedValue([]);
});

describe("createOpaiEvent", () => {
  it("persiste participantes internos y externos", async () => {
    const result = await createOpaiEvent({
      ...BASE,
      participantIds: ["p1", "owner"],
      externalEmails: [{ email: "cliente@empresa.cl", name: "Ana" }],
      accountId: "acc1",
      dealId: "deal1",
    });

    expect(result.eventId).toBe("ev-1");
    expect(mocks.visitaCreate).toHaveBeenCalled();
    expect(mocks.mirror).toHaveBeenCalled();
    expect(mocks.addParticipants).toHaveBeenCalledWith(
      "t1",
      "ev-1",
      [{ userId: "p1", role: "required" }],
      "actor",
    );
    expect(mocks.externalUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "cliente@empresa.cl" }),
      }),
    );
    expect(mocks.syncGoogle).toHaveBeenCalledWith("t1", "ev-1");
    expect(result.htmlLink).toContain("calendar.google.com");
  });

  it("rechaza deal de otro tenant sin escritura", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    await expect(
      createOpaiEvent({ ...BASE, dealId: "foreign" }),
    ).rejects.toBeInstanceOf(OpaiEventValidationError);
    expect(mocks.visitaCreate).not.toHaveBeenCalled();
  });
});

describe("updateOpaiEvent — diff participantes", () => {
  it("alta y baja reales", async () => {
    mocks.visitaFindFirst.mockResolvedValue({
      id: "ev-1",
      tenantId: "t1",
      title: "Visita",
      label: null,
      type: "otra",
      assignedUserId: "owner",
      accountId: null,
      installationId: null,
      dealId: null,
      startAt: BASE.startAt,
      endAt: BASE.endAt,
      allDay: false,
      notes: null,
      customAddress: null,
      lat: null,
      lng: null,
      contactIds: null,
      status: "programada",
      createdBy: "actor",
    });
    mocks.visitaUpdate.mockImplementation(async ({ data }) => ({
      id: "ev-1",
      tenantId: "t1",
      title: data.title ?? "Visita",
      label: data.label ?? null,
      type: "otra",
      assignedUserId: data.assignedUserId ?? "owner",
      dealId: null,
      status: "reprogramada",
    }));
    mocks.participantFindMany.mockResolvedValue([
      { userId: "owner", role: "owner" },
      { userId: "old", role: "required" },
    ]);
    mocks.adminFindMany.mockImplementation(async ({ where }) => {
      const ids: string[] = where?.id?.in ?? [];
      return ids.map((id: string) => ({ id, email: `${id}@gard.cl` }));
    });

    await updateOpaiEvent(
      "t1",
      "ev-1",
      { participantIds: ["new"] },
      "actor",
    );

    expect(mocks.addParticipants).toHaveBeenCalledWith(
      "t1",
      "ev-1",
      expect.arrayContaining([
        expect.objectContaining({ userId: "new" }),
      ]),
      "actor",
    );
    expect(mocks.removeParticipant).toHaveBeenCalledWith(
      "t1",
      "ev-1",
      "old",
      "actor",
    );
  });
});
