import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmLead: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    crmAccount: { findMany: vi.fn() },
    crmDeal: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
    crmContact: { findMany: vi.fn() },
    cpqQuote: { findMany: vi.fn() },
    opsGuardia: { findMany: vi.fn() },
    aiActionLog: { create: vi.fn() },
  },
}));

const executeQuoteDeleteMock = vi.hoisted(() => vi.fn());
const executeDealDeleteMock = vi.hoisted(() => vi.fn());
const executeLeadDeleteMock = vi.hoisted(() => vi.fn());
const buildQuoteDeleteImpactMock = vi.hoisted(() => vi.fn());
const buildDealDeleteImpactMock = vi.hoisted(() => vi.fn());
const resolveQuoteMock = vi.hoisted(() => vi.fn());
const approveLeadMock = vi.hoisted(() => vi.fn());
const rejectLeadMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/cpq/delete-quote.service", () => ({
  executeQuoteDelete: executeQuoteDeleteMock,
}));
vi.mock("@/modules/crm/delete-deal.service", () => ({
  executeDealDelete: executeDealDeleteMock,
}));
vi.mock("@/modules/crm/leads/delete-lead.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/crm/leads/delete-lead.service")>();
  return { ...actual, executeLeadDelete: executeLeadDeleteMock };
});
vi.mock("@/modules/cpq/quote-delete-impact", () => ({
  buildQuoteDeleteImpact: buildQuoteDeleteImpactMock,
  buildDealDeleteImpact: buildDealDeleteImpactMock,
}));
vi.mock("@/lib/ai/help-chat-resolvers", () => ({
  resolveQuoteByCodeOrName: resolveQuoteMock,
}));
vi.mock("@/modules/crm/leads/approve-lead.service", () => ({
  approveLead: approveLeadMock,
}));
vi.mock("@/modules/crm/leads/reject-lead.service", () => ({
  rejectLead: rejectLeadMock,
}));

import { prisma } from "@/lib/prisma";
import {
  executeToolCallV2,
  getToolDefinitionsV2,
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";
import {
  crmComercialReadToolDefinitions,
  crmComercialWriteToolDefinitions,
  searchLeadsForQuery,
  toolSearchLeads,
  toolGetLead,
  toolPreviewDeleteDeal,
  toolDeleteDeal,
  toolPreviewDeleteQuote,
  toolDeleteQuote,
  toolPreviewDeleteLead,
  toolDeleteLead,
  toolPreviewApproveLead,
  toolApproveLead,
  toolPreviewRejectLead,
  toolRejectLead,
} from "@/lib/ai/help-chat-crm-comercial-tools";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "33333333-3333-4333-8333-333333333333";

const permsFull = {
  modules: { crm: "full", cpq: "full" },
  submodules: {},
  capabilities: {},
} as RolePermissions;

const permsView = {
  modules: { crm: "view", cpq: "view" },
  submodules: {},
  capabilities: {},
} as RolePermissions;

const permsEdit = {
  modules: { crm: "edit", cpq: "edit" },
  submodules: {},
  capabilities: {},
} as RolePermissions;

const permsNone = {
  modules: {},
  submodules: {},
  capabilities: {},
} as RolePermissions;

describe("tool wiring comercial MCP", () => {
  it("expone tools de lectura y escritura en getToolDefinitionsV2", () => {
    const read = new Set(getToolDefinitionsV2(true, false).map((d) => d.function.name));
    const write = new Set(getToolDefinitionsV2(true, true).map((d) => d.function.name));
    expect(read.has("search_leads")).toBe(true);
    expect(read.has("get_lead")).toBe(true);
    expect(read.has("delete_deal")).toBe(false);
    expect(write.has("preview_delete_deal")).toBe(true);
    expect(write.has("delete_deal")).toBe(true);
    expect(write.has("preview_delete_quote")).toBe(true);
    expect(write.has("delete_quote")).toBe(true);
    expect(write.has("preview_delete_lead")).toBe(true);
    expect(write.has("delete_lead")).toBe(true);
    expect(write.has("preview_approve_lead")).toBe(true);
    expect(write.has("approve_lead")).toBe(true);
    expect(write.has("convert_lead")).toBe(true);
    expect(write.has("preview_reject_lead")).toBe(true);
    expect(write.has("reject_lead")).toBe(true);
    expect(getToolDefinitionsV2(true, false)).toHaveLength(60);
    expect(getToolDefinitionsV2(true, true)).toHaveLength(141);
  });

  it("search_all declara que incluye leads", () => {
    const def = getToolDefinitionsV2(true, false).find((d) => d.function.name === "search_all");
    expect(def?.function.description).toMatch(/leads/i);
  });

  it("las 11 tools comerciales de escritura solo aparecen con allowWrites", () => {
    const readNames = new Set(getToolDefinitionsV2(true, false).map((d) => d.function.name));
    const allNames = new Set(getToolDefinitionsV2(true, true).map((d) => d.function.name));
    const comercialWrites = crmComercialWriteToolDefinitions().map((d) => d.function.name);
    expect(comercialWrites).toHaveLength(11);
    for (const name of comercialWrites) {
      expect(readNames.has(name)).toBe(false);
      expect(allNames.has(name)).toBe(true);
    }
  });

  it("mapea preview → confirm y marca writes destructivas", () => {
    expect(PREVIEW_TO_CONFIRM.preview_delete_deal?.confirmToolName).toBe("delete_deal");
    expect(PREVIEW_TO_CONFIRM.preview_delete_quote?.confirmToolName).toBe("delete_quote");
    expect(PREVIEW_TO_CONFIRM.preview_delete_lead?.confirmToolName).toBe("delete_lead");
    expect(PREVIEW_TO_CONFIRM.preview_approve_lead?.confirmToolName).toBe("approve_lead");
    expect(PREVIEW_TO_CONFIRM.preview_reject_lead?.confirmToolName).toBe("reject_lead");
    expect(WRITE_TOOL_NAMES.has("delete_deal")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("delete_quote")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("delete_lead")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("approve_lead")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("convert_lead")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("reject_lead")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("preview_delete_deal")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("search_leads")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("get_lead")).toBe(false);
  });

  it("descriptions están en español", () => {
    for (const d of [...crmComercialReadToolDefinitions(), ...crmComercialWriteToolDefinitions()]) {
      expect(d.function.description.length).toBeGreaterThan(20);
      expect(d.function.description).toMatch(
        /[áéíóúñÁÉÍÓÚÑ]|lead|negocio|cotizaci|papelera|aprobar|rechazar|convert/i,
      );
    }
  });
});

describe("search_leads / get_lead", () => {
  beforeEach(() => {
    vi.mocked(prisma.crmLead.findMany).mockReset();
    vi.mocked(prisma.crmLead.findFirst).mockReset();
    vi.mocked(prisma.crmAccount.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.crmDeal.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.crmInstallation.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.crmContact.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.cpqQuote.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.opsGuardia.findMany).mockReset().mockResolvedValue([] as never);
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
  });

  it("searchLeadsForQuery filtra por tenant y texto", async () => {
    vi.mocked(prisma.crmLead.findMany).mockResolvedValue([
      {
        id: LEAD_ID,
        firstName: "Ana",
        lastName: "Soto",
        companyName: "Tempus",
        email: "ana@tempus.cl",
        phone: null,
        status: "pending",
        source: "web",
        commune: "Santiago",
        city: "Santiago",
        createdAt: new Date("2026-08-01"),
      },
    ] as never);

    const rows = await searchLeadsForQuery("t1", "Tempus", 10);
    expect(rows[0]?.companyName).toBe("Tempus");
    expect(rows[0]?.url).toBe(`/crm/leads/${LEAD_ID}`);
    expect(prisma.crmLead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1" }),
      }),
    );
  });

  it("search_all consulta crmLead y devuelve la clave leads", async () => {
    vi.mocked(prisma.crmLead.findMany).mockResolvedValue([
      {
        id: LEAD_ID,
        firstName: "Ana",
        lastName: "Soto",
        companyName: "Tempus",
        email: "ana@tempus.cl",
        phone: null,
        status: "pending",
        source: "web",
        commune: "Santiago",
        city: "Santiago",
        createdAt: new Date("2026-08-01"),
      },
    ] as never);

    const r = (await executeToolCallV2(
      "search_all",
      { query: "Tempus" },
      "t1",
      "u1",
      permsView,
      false,
    )) as { ok: true; data: { leads: Array<{ companyName: string | null }> } };

    expect(r.ok).toBe(true);
    expect(r.data.leads[0]?.companyName).toBe("Tempus");
    expect(prisma.crmLead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1" }),
      }),
    );
  });

  it("search_all con query vacío incluye leads: [] (no omite la clave)", async () => {
    const r = (await executeToolCallV2(
      "search_all",
      { query: "   " },
      "t1",
      "u1",
      permsView,
      false,
    )) as { ok: true; data: Record<string, unknown[]> };
    expect(r.data).toEqual({
      accounts: [],
      leads: [],
      deals: [],
      quotes: [],
      installations: [],
      contacts: [],
      guardias: [],
    });
    expect(prisma.crmLead.findMany).not.toHaveBeenCalled();
  });

  it("deniega search/get sin canView crm.leads", async () => {
    await expect(toolSearchLeads("t1", "u1", permsNone, { query: "x" })).resolves.toMatchObject({
      ok: false,
    });
    await expect(toolGetLead("t1", "u1", permsNone, { id: LEAD_ID })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("get_lead happy path", async () => {
    vi.mocked(prisma.crmLead.findFirst).mockResolvedValue({
      id: LEAD_ID,
      status: "pending",
      source: "web",
      firstName: "Ana",
      lastName: "Soto",
      email: "ana@tempus.cl",
      phone: null,
      companyName: "Tempus",
      notes: null,
      industry: null,
      address: null,
      commune: null,
      city: null,
      website: null,
      serviceType: null,
      approvedAt: null,
      convertedAccountId: null,
      convertedContactId: null,
      convertedDealId: null,
      firstContactAt: null,
      createdAt: new Date("2026-08-01"),
      updatedAt: new Date("2026-08-01"),
    } as never);
    const r = (await toolGetLead("t1", "u1", permsView, { id: LEAD_ID })) as {
      ok: true;
      data: { companyName: string; url: string };
    };
    expect(r.ok).toBe(true);
    expect(r.data.companyName).toBe("Tempus");
    expect(r.data.url).toBe(`/crm/leads/${LEAD_ID}`);
  });
});

describe("delete_quote preview + blockers + confirm", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    resolveQuoteMock.mockReset();
    buildQuoteDeleteImpactMock.mockReset();
    executeQuoteDeleteMock.mockReset();
    resolveQuoteMock.mockResolvedValue({ id: QUOTE_ID, code: "CPQ-2026-001", name: "Borrador Seúl" });
  });

  it("deniega sin canDelete de cotizaciones", async () => {
    const r = await toolPreviewDeleteQuote("t1", "u1", permsEdit, { quoteIdOrCode: "CPQ-2026-001" });
    expect(r).toMatchObject({ ok: false });
  });

  it("preview con blockers no permite proceder sin force", async () => {
    buildQuoteDeleteImpactMock.mockResolvedValue({
      quote: { id: QUOTE_ID, code: "CPQ-2026-001", name: "Seúl", status: "accepted" },
      bundle: null,
      counts: { positions: 2, attachments: 0, emailThreads: 0, tasks: 0 },
      blockers: [{ code: "PORTAL_ACCEPTED", label: "Fue aceptada por el cliente" }],
      warnings: [],
    });
    const preview = (await toolPreviewDeleteQuote("t1", "u1", permsFull, {
      quoteIdOrCode: "CPQ-2026-001",
    })) as { ok: true; data: { canProceed: boolean; summary: { blockers: unknown[] }; previewToken: string } };
    expect(preview.ok).toBe(true);
    expect(preview.data.canProceed).toBe(false);
    expect(preview.data.summary.blockers).toHaveLength(1);
  });

  it("exige confirm + previewToken y llama executeQuoteDelete", async () => {
    buildQuoteDeleteImpactMock.mockResolvedValue({
      quote: { id: QUOTE_ID, code: "CPQ-2026-001", name: "Borrador", status: "draft" },
      bundle: null,
      counts: { positions: 0, attachments: 0, emailThreads: 0, tasks: 0 },
      blockers: [],
      warnings: [],
    });
    executeQuoteDeleteMock.mockResolvedValue({
      ok: true,
      trashId: "trash-1",
      bundleDeleted: false,
      code: "CPQ-2026-001",
      name: "Borrador",
    });

    const noConfirm = await toolDeleteQuote("t1", "u1", permsFull, { quoteIdOrCode: QUOTE_ID });
    expect(noConfirm).toMatchObject({ ok: false });
    expect(String((noConfirm as { error: string }).error)).toMatch(/confirm/i);

    const preview = (await toolPreviewDeleteQuote("t1", "u1", permsFull, {
      quoteIdOrCode: "CPQ-2026-001",
    })) as { ok: true; data: { previewToken: string } };

    const applied = await toolDeleteQuote("t1", "u1", permsFull, {
      confirm: true,
      previewToken: preview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: true });
    expect(executeQuoteDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", userId: "u1", quoteId: QUOTE_ID }),
    );
  });

  it("confirm con blockers sin force propaga 409 del servicio UI", async () => {
    buildQuoteDeleteImpactMock.mockResolvedValue({
      quote: { id: QUOTE_ID, code: "CPQ-2026-001", name: "Seúl", status: "accepted" },
      bundle: null,
      counts: { positions: 1, attachments: 0, emailThreads: 0, tasks: 0 },
      blockers: [{ code: "PORTAL_ACCEPTED", label: "Fue aceptada por el cliente" }],
      warnings: [],
    });
    const preview = (await toolPreviewDeleteQuote("t1", "u1", permsFull, {
      quoteIdOrCode: QUOTE_ID,
      force: true,
    })) as { ok: true; data: { previewToken: string; canProceed: boolean } };
    expect(preview.data.canProceed).toBe(true);
    executeQuoteDeleteMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "La cotización tiene dependencias que impiden eliminarla directamente",
      blockers: [{ code: "PORTAL_ACCEPTED", label: "Fue aceptada por el cliente" }],
    });
    const applied = await toolDeleteQuote("t1", "u1", permsFull, {
      confirm: true,
      previewToken: preview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: false });
    expect((applied as { blockers: unknown[] }).blockers).toHaveLength(1);
  });
});

describe("delete_deal / delete_lead", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.crmLead.findFirst).mockReset();
    executeDealDeleteMock.mockReset();
    executeLeadDeleteMock.mockReset();
    buildDealDeleteImpactMock.mockReset();
  });

  it("delete_deal deniega sin full y exige preview", async () => {
    const denied = await toolPreviewDeleteDeal("t1", "u1", permsEdit, { dealId: DEAL_ID });
    expect(denied).toMatchObject({ ok: false });
    const noPreview = await toolDeleteDeal("t1", "u1", permsFull, { confirm: true, dealId: DEAL_ID });
    expect(noPreview).toMatchObject({ ok: false });
    expect(String((noPreview as { error: string }).error)).toMatch(/previewToken/i);
  });

  it("delete_lead deniega sin canDelete (nivel full)", async () => {
    const denied = await toolPreviewDeleteLead("t1", "u1", permsEdit, { leadId: LEAD_ID });
    expect(denied).toMatchObject({ ok: false });
  });

  it("preview + confirm elimina deal vía executeDealDelete", async () => {
    buildDealDeleteImpactMock.mockResolvedValue({
      deal: { id: DEAL_ID, title: "Seúl" },
      quotes: [],
      bundles: [],
      agenda: { visitas: [], licitacionLink: null, counts: { agendaEvents: 0, licitacionBands: 0 } },
      installation: null,
      counts: { quotes: 0, bundles: 0, positions: 0, attachments: 0, agendaEvents: 0, licitacionBands: 0 },
      blockers: [],
      warnings: [],
    });
    executeDealDeleteMock.mockResolvedValue({
      ok: true,
      title: "Seúl",
      cascaded: { quotes: 1, bundles: 0, agendaEvents: 0, licitacionBands: 0, installationDeleted: false, googleErrors: 0 },
    });
    const preview = (await toolPreviewDeleteDeal("t1", "u1", permsFull, { dealId: DEAL_ID })) as {
      ok: true;
      data: { previewToken: string };
    };
    const applied = await toolDeleteDeal("t1", "u1", permsFull, {
      confirm: true,
      previewToken: preview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: true });
    expect(executeDealDeleteMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", dealId: DEAL_ID }),
    );
  });

  it("delete_lead no borra aprobados y exige confirm", async () => {
    vi.mocked(prisma.crmLead.findFirst).mockResolvedValue({
      id: LEAD_ID,
      status: "approved",
      firstName: "A",
      lastName: "B",
      companyName: "X",
      email: null,
    } as never);
    const preview = (await toolPreviewDeleteLead("t1", "u1", permsFull, { leadId: LEAD_ID })) as {
      ok: true;
      data: { canProceed: boolean; previewToken: string | null };
    };
    expect(preview.data.canProceed).toBe(false);
    expect(preview.data.previewToken).toBeNull();

    vi.mocked(prisma.crmLead.findFirst).mockResolvedValue({
      id: LEAD_ID,
      status: "pending",
      firstName: "A",
      lastName: "B",
      companyName: "X",
      email: null,
    } as never);
    const okPreview = (await toolPreviewDeleteLead("t1", "u1", permsFull, { leadId: LEAD_ID })) as {
      ok: true;
      data: { previewToken: string };
    };
    executeLeadDeleteMock.mockResolvedValue({ ok: true, id: LEAD_ID, displayName: "A B", status: "pending" });
    const applied = await toolDeleteLead("t1", "u1", permsFull, {
      confirm: true,
      previewToken: okPreview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: true });
  });
});

describe("approve / reject lead", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.crmLead.findFirst).mockReset();
    approveLeadMock.mockReset();
    rejectLeadMock.mockReset();
    vi.mocked(prisma.crmLead.findFirst).mockResolvedValue({
      id: LEAD_ID,
      status: "pending",
      firstName: "Ana",
      lastName: "Soto",
      companyName: "Tempus",
      email: "ana@tempus.cl",
      phone: null,
    } as never);
  });

  it("deniega approve/reject sin canEdit", async () => {
    await expect(toolPreviewApproveLead("t1", "u1", permsView, { leadId: LEAD_ID })).resolves.toMatchObject({
      ok: false,
    });
    await expect(toolPreviewRejectLead("t1", "u1", permsView, { leadId: LEAD_ID })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("approve_lead exige confirm y llama approveLead tras preview", async () => {
    approveLeadMock.mockResolvedValue(
      NextResponse.json({
        success: true,
        duplicates: [],
        existingContact: null,
        data: { deal: { id: DEAL_ID }, account: { id: "acc-1" } },
      }),
    );
    const refused = await toolApproveLead("t1", "u1", permsFull, { leadId: LEAD_ID, confirm: true });
    expect(refused).toMatchObject({ ok: false });

    const preview = (await toolPreviewApproveLead("t1", "u1", permsFull, { leadId: LEAD_ID })) as {
      ok: true;
      data: { previewToken: string };
    };
    expect(preview.ok).toBe(true);
    expect(approveLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ checkDuplicates: true }) }),
    );

    approveLeadMock.mockResolvedValue(
      NextResponse.json({
        success: true,
        data: { deal: { id: DEAL_ID, title: "Oportunidad Tempus" }, account: { id: "acc-1" } },
      }),
    );
    const applied = await toolApproveLead("t1", "u1", permsFull, {
      confirm: true,
      previewToken: preview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: true });
  });

  it("convert_lead reusa el previewToken de preview_approve_lead", async () => {
    approveLeadMock.mockResolvedValue(NextResponse.json({ success: true, duplicates: [] }));
    const preview = (await toolPreviewApproveLead("t1", "u1", permsFull, { leadId: LEAD_ID })) as {
      ok: true;
      data: { previewToken: string };
    };
    approveLeadMock.mockResolvedValue(
      NextResponse.json({ success: true, data: { deal: { id: DEAL_ID } } }),
    );
    const converted = await toolApproveLead(
      "t1",
      "u1",
      permsFull,
      { confirm: true, previewToken: preview.data.previewToken },
      "convert_lead",
    );
    expect(converted).toMatchObject({ ok: true });
  });

  it("reject_lead exige preview y llama rejectLead", async () => {
    const refused = await toolRejectLead("t1", "u1", permsEdit, { leadId: LEAD_ID });
    expect(refused).toMatchObject({ ok: false });
    const preview = (await toolPreviewRejectLead("t1", "u1", permsEdit, {
      leadId: LEAD_ID,
      reason: "duplicate",
    })) as { ok: true; data: { previewToken: string } };
    rejectLeadMock.mockResolvedValue(
      NextResponse.json({ success: true, data: { id: LEAD_ID }, email: { sent: false } }),
    );
    const applied = await toolRejectLead("t1", "u1", permsEdit, {
      confirm: true,
      previewToken: preview.data.previewToken,
    });
    expect(applied).toMatchObject({ ok: true });
    expect(rejectLeadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        leadId: LEAD_ID,
        body: expect.objectContaining({ reason: "duplicate" }),
      }),
    );
  });
});
