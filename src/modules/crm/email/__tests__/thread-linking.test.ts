/**
 * Matching de hilos (fuga de borradores / bandeja desincronizada):
 * el fallback por asunto SOLO adopta hilos huérfanos de la propia casilla o sin
 * dueño y SIN threadId de Gmail — nunca roba el hilo de otra casilla ni fusiona
 * dos hilos Gmail distintos con el mismo asunto.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  dealFindMany: vi.fn(),
  threadFindUnique: vi.fn(),
  threadFindFirst: vi.fn(),
  threadCreate: vi.fn(),
  threadUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  emailAccountFindMany: vi.fn(),
  getTenantCompanyConfig: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: {
      findFirst: mocks.contactFindFirst,
      findMany: mocks.contactFindMany,
    },
    crmDeal: { findMany: mocks.dealFindMany },
    crmEmailThread: {
      findUnique: mocks.threadFindUnique,
      findFirst: mocks.threadFindFirst,
      create: mocks.threadCreate,
      update: mocks.threadUpdate,
    },
    tenant: { findUnique: mocks.tenantFindUnique },
    crmEmailAccount: { findMany: mocks.emailAccountFindMany },
  },
}));

vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: mocks.getTenantCompanyConfig,
}));

import {
  counterpartyEmailsForLinking,
  resolveThreadLinks,
  upsertLinkedThread,
} from "../thread-linking";

const OWN = "acc-mine";
const OTHER = "acc-other";

beforeEach(() => {
  vi.clearAllMocks();
  // Sin contacto → links vacíos (no interesa el enriquecimiento aquí).
  mocks.contactFindFirst.mockResolvedValue(null);
  mocks.contactFindMany.mockResolvedValue([]);
  mocks.dealFindMany.mockResolvedValue([]);
  mocks.threadFindUnique.mockResolvedValue(null);
  mocks.threadFindFirst.mockResolvedValue(null);
  mocks.threadCreate.mockResolvedValue({ id: "th-new" });
  mocks.threadUpdate.mockResolvedValue({ id: "th-upd" });
  mocks.getTenantCompanyConfig.mockResolvedValue({
    companyName: "Gard Security",
    commercialName: "Gard Security",
    razonSocial: "Gard Security SpA",
    website: "https://www.gard.cl",
  });
  mocks.tenantFindUnique.mockResolvedValue({ name: "Gard Security" });
  mocks.emailAccountFindMany.mockResolvedValue([{ email: "owner@gard.cl" }]);
});

describe("counterpartyEmailsForLinking", () => {
  it("inbound solo usa From/Reply-To (ignora To/CC internos)", () => {
    expect(
      counterpartyEmailsForLinking({
        direction: "in",
        fromEmail: "carlaandrea.nunez@corrupac.cl",
        replyToEmail: null,
        toEmails: ["carlos@gard.cl"],
        ccEmails: ["coleaga@gard.cl", "otro@corrupac.cl"],
        ownEmail: "carlos@gard.cl",
      }),
    ).toEqual(["carlaandrea.nunez@corrupac.cl"]);
  });

  it("outbound usa To/CC externos", () => {
    expect(
      counterpartyEmailsForLinking({
        direction: "out",
        fromEmail: "carlos@gard.cl",
        toEmails: ["carlaandrea.nunez@corrupac.cl"],
        ccEmails: ["coleaga@gard.cl"],
        ownEmail: "carlos@gard.cl",
      }),
    ).toEqual(["carlaandrea.nunez@corrupac.cl", "coleaga@gard.cl"]);
  });
});

describe("resolveThreadLinks — orden de candidatos", () => {
  it("prefiere el primer email (From) si varios candidatos tienen contacto", async () => {
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "c-gard",
        accountId: "acc-gard",
        email: "coleaga@gard.cl",
        account: { id: "acc-gard", name: "Gard Security", website: "https://www.gard.cl" },
      },
      {
        id: "c-carla",
        accountId: "acc-corrupac",
        email: "carlaandrea.nunez@corrupac.cl",
        account: { id: "acc-corrupac", name: "Corrupac", website: "https://corrupac.cl" },
      },
    ]);
    mocks.dealFindMany.mockResolvedValue([]);

    const links = await resolveThreadLinks("t1", [
      "carlaandrea.nunez@corrupac.cl",
      "coleaga@gard.cl",
    ]);

    expect(links).toEqual({
      contactId: "c-carla",
      accountId: "acc-corrupac",
      dealId: null,
    });
  });

  it("no auto-asocia a la cuenta propia del tenant aunque el contacto exista ahí", async () => {
    mocks.contactFindMany.mockResolvedValue([
      {
        id: "c-gard",
        accountId: "acc-gard",
        email: "cliente@externo.cl",
        account: { id: "acc-gard", name: "Gard Security", website: "https://www.gard.cl" },
      },
    ]);

    const links = await resolveThreadLinks("t1", ["cliente@externo.cl"]);
    expect(links).toEqual({
      contactId: "c-gard",
      accountId: null,
      dealId: null,
    });
    expect(mocks.dealFindMany).not.toHaveBeenCalled();
  });
});

describe("upsertLinkedThread — scope del fallback por asunto", () => {
  it("acota el fallback a huérfanos propios/sin dueño y providerThreadId null", async () => {
    await upsertLinkedThread({
      tenantId: "t1",
      subject: "(Borrador sin asunto)",
      lastMessageAt: new Date(),
      counterpartyEmails: [],
      emailAccountId: OWN,
      providerThreadId: "gmail-thread-1",
      isInbound: false,
    });

    expect(mocks.threadFindFirst).toHaveBeenCalledTimes(1);
    const where = mocks.threadFindFirst.mock.calls[0][0].where;
    expect(where.providerThreadId).toBeNull();
    expect(where.OR).toEqual([{ emailAccountId: null }, { emailAccountId: OWN }]);
    // NO debe consultar por { tenantId, subject } a secas (cruzaba casillas).
    expect(where).not.toEqual({ tenantId: "t1", subject: "(Borrador sin asunto)" });
  });

  it("no adopta el hilo de otra casilla con el mismo asunto → crea uno nuevo", async () => {
    // El query scopeado no devuelve nada (el hilo de OTHER queda excluido).
    mocks.threadFindFirst.mockResolvedValue(null);

    const res = await upsertLinkedThread({
      tenantId: "t1",
      subject: "Cotización",
      lastMessageAt: new Date(),
      counterpartyEmails: ["cliente@acme.com"],
      emailAccountId: OWN,
      providerThreadId: "gmail-own-1",
      isInbound: true,
    });

    expect(mocks.threadCreate).toHaveBeenCalledTimes(1);
    expect(mocks.threadUpdate).not.toHaveBeenCalled();
    expect(mocks.threadCreate.mock.calls[0][0].data).toMatchObject({
      emailAccountId: OWN,
      providerThreadId: "gmail-own-1",
    });
    expect(res).toEqual({ id: "th-new" });
  });

  it("adopta un hilo huérfano legacy (sin dueño, sin threadId)", async () => {
    mocks.threadFindFirst.mockResolvedValue({
      id: "th-legacy",
      contactId: null,
      accountId: null,
      dealId: null,
      lastMessageAt: null,
    });

    const res = await upsertLinkedThread({
      tenantId: "t1",
      subject: "Seguimiento propuesta",
      lastMessageAt: new Date(),
      counterpartyEmails: ["cliente@acme.com"],
      emailAccountId: OWN,
      providerThreadId: "gmail-own-2",
      isInbound: true,
    });

    expect(mocks.threadCreate).not.toHaveBeenCalled();
    expect(mocks.threadUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.threadUpdate.mock.calls[0][0].data).toMatchObject({
      emailAccountId: OWN,
      providerThreadId: "gmail-own-2",
    });
    expect(res).toEqual({ id: "th-legacy" });
  });

  it("sin emailAccountId, el fallback solo busca huérfanos sin dueño", async () => {
    await upsertLinkedThread({
      tenantId: "t1",
      subject: "Sin casilla",
      lastMessageAt: new Date(),
      counterpartyEmails: [],
      emailAccountId: null,
      providerThreadId: null,
    });

    // Sin emailAccountId no hay findUnique; el fallback exige emailAccountId null.
    expect(mocks.threadFindUnique).not.toHaveBeenCalled();
    const where = mocks.threadFindFirst.mock.calls[0][0].where;
    expect(where.providerThreadId).toBeNull();
    expect(where.emailAccountId).toBeNull();
    expect(where.OR).toBeUndefined();
  });

  it("prioriza el match exacto por (emailAccountId, providerThreadId)", async () => {
    mocks.threadFindUnique.mockResolvedValue({
      id: "th-exact",
      contactId: null,
      accountId: null,
      dealId: null,
      lastMessageAt: null,
    });

    const res = await upsertLinkedThread({
      tenantId: "t1",
      subject: "Cualquiera",
      lastMessageAt: new Date(),
      counterpartyEmails: [],
      emailAccountId: OWN,
      providerThreadId: "gmail-own-3",
      isInbound: true,
    });

    // Con match exacto no se consulta el fallback por asunto.
    expect(mocks.threadFindFirst).not.toHaveBeenCalled();
    expect(res).toEqual({ id: "th-exact" });
  });
});
