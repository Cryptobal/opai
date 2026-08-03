import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: vi.fn() },
    cpqQuote: { findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    crmAccount: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  EMPTY_CRM_LINKS,
  hasCrmLinksPatch,
  parseCrmLinksPatch,
  resolveCrmLinks,
} from "../tarea-crm-links";

describe("parseCrmLinksPatch", () => {
  it("ignora campos ausentes", () => {
    expect(parseCrmLinksPatch({})).toEqual({});
  });

  it("acepta null y string", () => {
    expect(parseCrmLinksPatch({ accountId: "a1", dealId: null })).toEqual({
      accountId: "a1",
      dealId: null,
    });
  });

  it("rechaza tipos inválidos", () => {
    expect(parseCrmLinksPatch({ accountId: 1 })).toEqual({
      error: "Vinculación CRM inválida (accountId)",
    });
  });
});

describe("hasCrmLinksPatch", () => {
  it("detecta cualquier campo presente", () => {
    expect(hasCrmLinksPatch({})).toBe(false);
    expect(hasCrmLinksPatch({ quoteId: null })).toBe(true);
  });
});

describe("resolveCrmLinks", () => {
  beforeEach(() => {
    vi.mocked(prisma.crmDeal.findFirst).mockReset();
    vi.mocked(prisma.cpqQuote.findFirst).mockReset();
    vi.mocked(prisma.crmInstallation.findFirst).mockReset();
    vi.mocked(prisma.crmAccount.findFirst).mockReset();
  });

  it("limpia hijos al quitar la cuenta", async () => {
    const r = await resolveCrmLinks(
      "t1",
      {
        accountId: "a1",
        dealId: "d1",
        quoteId: "q1",
        installationId: "i1",
      },
      { accountId: null },
    );
    expect(r).toEqual({
      ok: true,
      value: EMPTY_CRM_LINKS,
    });
  });

  it("hereda accountId desde el negocio", async () => {
    vi.mocked(prisma.crmDeal.findFirst).mockResolvedValue({
      id: "d1",
      accountId: "a1",
    } as never);
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({ id: "a1" } as never);

    const r = await resolveCrmLinks("t1", EMPTY_CRM_LINKS, { dealId: "d1" });
    expect(r).toEqual({
      ok: true,
      value: {
        accountId: "a1",
        dealId: "d1",
        quoteId: null,
        installationId: null,
      },
    });
  });

  it("rechaza negocio de otra cuenta", async () => {
    vi.mocked(prisma.crmDeal.findFirst).mockResolvedValue({
      id: "d1",
      accountId: "a2",
    } as never);

    const r = await resolveCrmLinks(
      "t1",
      { ...EMPTY_CRM_LINKS, accountId: "a1" },
      { dealId: "d1" },
    );
    expect(r).toEqual({
      ok: false,
      error: "El negocio no pertenece a la cuenta seleccionada",
    });
  });

  it("al cambiar cuenta limpia hijos no reenviados", async () => {
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({ id: "a2" } as never);
    const r = await resolveCrmLinks(
      "t1",
      {
        accountId: "a1",
        dealId: "d1",
        quoteId: "q1",
        installationId: "i1",
      },
      { accountId: "a2" },
    );
    expect(r).toEqual({
      ok: true,
      value: {
        accountId: "a2",
        dealId: null,
        quoteId: null,
        installationId: null,
      },
    });
  });
});
