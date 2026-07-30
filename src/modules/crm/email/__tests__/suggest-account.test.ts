import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindMany: vi.fn(),
  contactFindMany: vi.fn(),
  accountFindMany: vi.fn(),
  threadFindMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  emailAccountFindMany: vi.fn(),
  getTenantCompanyConfig: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailMessage: { findMany: mocks.messageFindMany },
    crmContact: { findMany: mocks.contactFindMany },
    crmAccount: { findMany: mocks.accountFindMany },
    crmEmailThread: { findMany: mocks.threadFindMany },
    tenant: { findUnique: mocks.tenantFindUnique },
    crmEmailAccount: { findMany: mocks.emailAccountFindMany },
  },
}));

vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: mocks.getTenantCompanyConfig,
}));

import { suggestAccountsForThread } from "../suggest-account";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTenantCompanyConfig.mockResolvedValue({
    companyName: "Gard Security",
    commercialName: "Gard Security",
    razonSocial: "Gard Security SpA",
    website: "https://www.gard.cl",
    email: "",
    emailOps: "",
    emailFinance: "",
    emailContact: "",
    emailFromAddress: "",
    emailReplyTo: "", // pragma: allowlist secret
  });
  mocks.tenantFindUnique.mockResolvedValue({ name: "Gard Security" });
  mocks.emailAccountFindMany.mockResolvedValue([{ email: "owner@gard.cl" }]);
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.contactFindMany.mockResolvedValue([]);
  mocks.accountFindMany.mockResolvedValue([]);
  mocks.threadFindMany.mockResolvedValue([]);
});

describe("suggestAccountsForThread", () => {
  it("no sugiere la cuenta propia del tenant aunque haya hilos previos asociados", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        fromEmail: "Carla Nuñez <carlaandrea.nunez@corrupac.cl>",
        textBody: "Hola, coordinemos la reunión",
        htmlBody: null,
        subject: "Coordinación reunión",
      },
    ]);
    // Paso 1: sin contacto exacto
    // Paso 3: hilos previos → Gard Security (mala asociación histórica)
    mocks.threadFindMany.mockResolvedValue([
      {
        id: "th-old",
        accountId: "acc-gard",
        messages: [
          { fromEmail: "Carla Nuñez <carlaandrea.nunez@corrupac.cl>" },
        ],
      },
    ]);
    mocks.accountFindMany.mockImplementation(async ({ where }: { where: { id?: { in?: string[] } } }) => {
      const ids = where.id?.in ?? [];
      return ids
        .filter((id: string) => id === "acc-gard")
        .map(() => ({
          id: "acc-gard",
          name: "Gard Security",
          website: "https://www.gard.cl",
        }));
    });
    // Corroboración de dominio: ningún contacto @corrupac en Gard Security
    mocks.contactFindMany.mockResolvedValue([]);

    const suggestions = await suggestAccountsForThread("gard", "th-current");
    expect(suggestions).toEqual([]);
  });

  it("sugiere cuenta de hilos previos solo si corrobora el dominio del remitente", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        fromEmail: "Carla Nuñez <carlaandrea.nunez@corrupac.cl>",
        textBody: "Hola",
        htmlBody: null,
        subject: "Reunión",
      },
    ]);
    mocks.threadFindMany.mockResolvedValue([
      {
        id: "th-old",
        accountId: "acc-corrupac",
        messages: [
          { fromEmail: "Carla Nuñez <carlaandrea.nunez@corrupac.cl>" },
        ],
      },
    ]);
    mocks.accountFindMany.mockResolvedValue([
      {
        id: "acc-corrupac",
        name: "Corrupac",
        website: "https://www.corrupac.cl",
      },
    ]);
    // Contacto @corrupac.cl en esa cuenta → corrobora dominio
    mocks.contactFindMany.mockResolvedValue([
      { accountId: "acc-corrupac" },
    ]);

    const suggestions = await suggestAccountsForThread("gard", "th-current");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: "acc-corrupac",
      name: "Corrupac",
      reason: "Hilos previos del mismo remitente",
      confidence: "media",
    });
    expect(suggestions[0].evidenceThreadIds).toContain("th-old");
  });

  it("prioriza dominio de contactos sobre asociaciones previas ajenas al dominio", async () => {
    mocks.messageFindMany.mockResolvedValue([
      {
        fromEmail: "carlaandrea.nunez@corrupac.cl",
        textBody: "",
        htmlBody: null,
        subject: "Hola",
      },
    ]);
    // Sin hilos previos útiles
    mocks.threadFindMany.mockResolvedValue([]);
    // Paso 4: contactos @corrupac.cl → cuenta Corrupac
    mocks.contactFindMany.mockResolvedValue([{ accountId: "acc-corrupac" }]);
    mocks.accountFindMany.mockResolvedValue([
      { id: "acc-corrupac", name: "Corrupac COIPSA", website: "www.corrupac.cl" },
    ]);

    const suggestions = await suggestAccountsForThread("gard", "th-current");
    expect(suggestions).toEqual([
      expect.objectContaining({
        id: "acc-corrupac",
        reason: "Mismo dominio de correo",
        confidence: "media",
      }),
    ]);
  });
});
