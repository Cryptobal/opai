/**
 * Tests del servicio de autocompletado (C21a): ranking, dedup, normalización,
 * aislamiento tenant/usuario en las queries, y el hook recordRecipients.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  contactFindMany: vi.fn(),
  recipientFindMany: vi.fn(),
  recipientUpsert: vi.fn(),
  captureEmailError: vi.fn(),
}));

const mailboxMocks = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: { findMany: mocks.contactFindMany },
    crmEmailRecipient: {
      findMany: mocks.recipientFindMany,
      upsert: mocks.recipientUpsert,
    },
    crmEmailAccount: { findMany: mailboxMocks.accountFindMany },
    crmEmailMessage: { findMany: mailboxMocks.messageFindMany },
  },
}));
vi.mock("../email-observability", () => ({
  captureEmailError: mocks.captureEmailError,
}));

import {
  matchQuality,
  mergeRecipientSuggestions,
  recordRecipients,
  scoreRecipient,
  suggestRecipients,
} from "../email-recipients";

const NOW = new Date("2026-07-22T12:00:00Z").getTime();
const days = (n: number) => new Date(NOW - n * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contactFindMany.mockResolvedValue([]);
  mocks.recipientFindMany.mockResolvedValue([]);
  mocks.recipientUpsert.mockResolvedValue({});
  mailboxMocks.accountFindMany.mockResolvedValue([]);
  mailboxMocks.messageFindMany.mockResolvedValue([]);
});

describe("matchQuality", () => {
  it("prefijo > substring > sin match", () => {
    expect(matchQuality("car", "carlos@x.cl", null)).toBe(2);
    expect(matchQuality("car", "oscar@x.cl", null)).toBe(1);
    expect(matchQuality("car", "pedro@x.cl", "Pedro Soto")).toBe(0);
    // prefijo por cualquier palabra del nombre cuenta como prefijo
    expect(matchQuality("per", "x@x.cl", "juan perez")).toBe(2);
    // substring dentro del nombre (no prefijo de palabra) vale 1
    expect(matchQuality("ere", "x@x.cl", "juan perez")).toBe(1);
  });
});

describe("scoreRecipient", () => {
  it("la frecuencia decae con half-life ~90 días", () => {
    const fresh = scoreRecipient({ sendCount: 10, lastSentAt: days(0), matchQuality: 1, now: NOW });
    const old = scoreRecipient({ sendCount: 10, lastSentAt: days(90), matchQuality: 1, now: NOW });
    // A 90 días la componente de frecuencia vale la mitad.
    expect(old).toBeLessThan(fresh);
    expect(old - 1).toBeCloseTo((10 * 0.5) + 8 * 0.5 ** (90 / 14), 5);
  });

  it("recencia empuja a destinatarios recientes con pocos envíos", () => {
    const recentFew = scoreRecipient({ sendCount: 1, lastSentAt: days(1), matchQuality: 1, now: NOW });
    const oldMany = scoreRecipient({ sendCount: 5, lastSentAt: days(300), matchQuality: 1, now: NOW });
    expect(recentFew).toBeGreaterThan(oldMany);
  });

  it("sin historial queda el término base (el contacto CRM igual aparece)", () => {
    expect(scoreRecipient({ sendCount: 0, lastSentAt: null, matchQuality: 2, now: NOW })).toBe(2);
  });
});

describe("mergeRecipientSuggestions", () => {
  it("dedup por email normalizado prefiriendo CRM enriquecido con frecency", () => {
    const out = mergeRecipientSuggestions({
      q: "ana",
      limit: 8,
      crmContacts: [{ id: "c1", email: "ANA@Empresa.cl", name: "Ana Silva" }],
      recents: [
        { email: "ana@empresa.cl", displayName: null, sendCount: 20, lastSentAt: days(1), contactId: null },
        { email: "anastasia@otra.cl", displayName: "Anastasia R", sendCount: 2, lastSentAt: days(5), contactId: null },
      ],
      now: NOW,
    });
    expect(out).toHaveLength(2);
    // La entrada CRM gana el dedup y conserva contactId; el email queda lowercase.
    expect(out[0]).toMatchObject({ email: "ana@empresa.cl", source: "crm", contactId: "c1" });
    expect(out[1]).toMatchObject({ email: "anastasia@otra.cl", source: "recent" });
  });

  it("la frecuencia ordena por encima de un contacto CRM sin historial", () => {
    const out = mergeRecipientSuggestions({
      q: "a",
      limit: 8,
      crmContacts: [{ id: "c1", email: "abogado@x.cl", name: "Abel Abogado" }],
      recents: [
        { email: "amiga@x.cl", displayName: null, sendCount: 30, lastSentAt: days(2), contactId: null },
      ],
      now: NOW,
    });
    expect(out[0].email).toBe("amiga@x.cl");
    expect(out[1].email).toBe("abogado@x.cl");
  });

  it("respeta el límite y filtra los que no matchean", () => {
    const out = mergeRecipientSuggestions({
      q: "zz",
      limit: 8,
      crmContacts: [{ id: "c1", email: "ana@x.cl", name: "Ana" }],
      recents: [],
      now: NOW,
    });
    expect(out).toHaveLength(0);
  });
});

describe("suggestRecipients — aislamiento tenant/usuario", () => {
  it("los contactos se filtran por tenant y la frecency por tenant+usuario", async () => {
    await suggestRecipients("ana", { tenantId: "t1", userId: "u1" });

    expect(mocks.contactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1" }),
      }),
    );
    expect(mocks.recipientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1", userId: "u1" }),
      }),
    );
  });

  it("con q vacío solo consulta frecuentes del usuario (precarga)", async () => {
    await suggestRecipients("", { tenantId: "t1", userId: "u1", limit: 20 });
    expect(mocks.contactFindMany).not.toHaveBeenCalled();
    expect(mocks.recipientFindMany).toHaveBeenCalled();
  });
});

describe("recordRecipients", () => {
  it("normaliza, deduplica y hace upsert con increment por destinatario", async () => {
    mocks.contactFindMany.mockResolvedValue([
      { id: "c1", email: "ana@empresa.cl", firstName: "Ana", lastName: "Silva" },
    ]);

    await recordRecipients({
      tenantId: "t1",
      userId: "u1",
      to: ["Ana@Empresa.cl", "ana@empresa.cl"],
      cc: ["socio@otra.cl"],
      bcc: [],
      sentAt: new Date("2026-07-22T12:00:00Z"),
    });

    // 2 destinatarios únicos (Ana deduplicada tras normalizar).
    expect(mocks.recipientUpsert).toHaveBeenCalledTimes(2);
    const anaCall = mocks.recipientUpsert.mock.calls.find(
      (c) => c[0].where.tenantId_userId_email.email === "ana@empresa.cl",
    );
    expect(anaCall![0].create).toMatchObject({
      tenantId: "t1",
      userId: "u1",
      sendCount: 1,
      displayName: "Ana Silva",
      contactId: "c1",
    });
    expect(anaCall![0].update).toMatchObject({
      sendCount: { increment: 1 },
      contactId: "c1",
    });
  });

  it("nunca lanza si la escritura falla", async () => {
    mocks.recipientUpsert.mockRejectedValue(new Error("db down"));
    await expect(
      recordRecipients({ tenantId: "t1", userId: "u1", to: ["a@b.cl"] }),
    ).resolves.toBeUndefined();
    expect(mocks.captureEmailError).toHaveBeenCalled();
  });

  it("ignora entradas sin @ y no consulta nada con lista vacía", async () => {
    await recordRecipients({ tenantId: "t1", userId: "u1", to: ["sin-arroba"] });
    expect(mocks.recipientUpsert).not.toHaveBeenCalled();
  });
});
