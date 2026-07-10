import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findFirst: vi.fn() },
    crmHistoryLog: { findFirst: vi.fn() },
    docTemplate: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildSlackWaEntities, resolveSlackWaUrl } from "../wa-context";

describe("buildSlackWaEntities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantCompanyConfig).mockResolvedValue({
      commercialName: "Gard Security",
      website: "www.gard.cl",
      phone: "+56 9 1111 1111",
      email: "comercial@gard.cl",
      whatsappLink: "https://wa.me/56911111111",
    } as never);
    vi.mocked(prisma.crmHistoryLog.findFirst).mockResolvedValue({
      createdBy: "admin-sender",
    } as never);
    vi.mocked(prisma.admin.findFirst).mockResolvedValue({
      name: "María López",
      email: "maria@gard.cl",
      cargo: "Ejecutiva Comercial",
    } as never);
  });

  it("incluye tenant y actor del remitente de la cotización", async () => {
    const entities = await buildSlackWaEntities(
      "tenant-1",
      { contact: { firstName: "Gisella" }, account: { name: "condominio la laguna" } },
      { quoteId: "quote-1" },
    );

    expect(entities.tenant).toEqual({
      commercialName: "Gard Security",
      website: "www.gard.cl",
      phone: "+56 9 1111 1111",
      email: "comercial@gard.cl",
      whatsappLink: "https://wa.me/56911111111",
    });
    expect(entities.actor).toMatchObject({
      firstName: "María",
      lastName: "López",
      name: "María López",
    });
    expect(entities.contact).toEqual({ firstName: "Gisella" });
    expect(entities.account).toEqual({ name: "condominio la laguna" });
  });

  it("prioriza adminId explícito sobre el remitente de la cotización", async () => {
    vi.mocked(prisma.admin.findFirst).mockResolvedValue({
      name: "Juan Pérez",
      email: "juan@gard.cl",
      cargo: null,
    } as never);

    const entities = await buildSlackWaEntities(
      "tenant-1",
      {},
      { quoteId: "quote-1", adminId: "admin-clicker" },
    );

    expect(prisma.admin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-clicker", tenantId: "tenant-1" } }),
    );
    expect(entities.actor).toMatchObject({ firstName: "Juan", lastName: "Pérez" });
  });
});

describe("resolveSlackWaUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantCompanyConfig).mockResolvedValue({
      commercialName: "Gard Security",
      website: "",
      phone: "",
      email: "",
      whatsappLink: "",
    } as never);
    vi.mocked(prisma.crmHistoryLog.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.admin.findFirst).mockResolvedValue({
      name: "Carlos Ruiz",
      email: "carlos@gard.cl",
      cargo: null,
    } as never);
    vi.mocked(prisma.docTemplate.findFirst).mockResolvedValue({
      id: "tpl-1",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Hola {{contact.firstName}}, soy {{actor.fullName}} de {{tenant.commercialName}}.",
              },
            ],
          },
        ],
      },
    } as never);
  });

  it("resuelve placeholders y construye URL wa.me", async () => {
    const url = await resolveSlackWaUrl(
      "tenant-1",
      "hub_stale",
      "56942885835",
      { contact: { firstName: "Gisella" }, account: { name: "condominio la laguna" } },
      { adminId: "admin-1" },
    );

    expect(url).toContain("https://wa.me/56942885835?text=");
    const decoded = decodeURIComponent(url!.split("text=")[1] ?? "");
    expect(decoded).toContain("Gisella");
    expect(decoded).toContain("Carlos Ruiz");
    expect(decoded).toContain("Gard Security");
    expect(decoded).not.toContain("{{actor.fullName}}");
    expect(decoded).not.toContain("{{tenant.commercialName}}");
  });

  it("devuelve null sin teléfono", async () => {
    const url = await resolveSlackWaUrl("tenant-1", "hub_stale", null, {});
    expect(url).toBeNull();
  });
});
