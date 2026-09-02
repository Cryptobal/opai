import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";
import { FutureIssueDateError } from "@/modules/finance/billing/dte-issuer.service";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findFirst: vi.fn() },
    financeDteRecurringRun: { findFirst: vi.fn() },
    financeDteRecurringTemplate: { findFirst: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
    crmAccount: { findFirst: vi.fn() },
    aiActionLog: { create: vi.fn() },
  },
}));

const issueDraftDteMock = vi.hoisted(() => vi.fn());
const enrichEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/finance/billing/dte-draft.service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/finance/billing/dte-draft.service")
  >();
  return { ...actual, issueDraftDte: issueDraftDteMock };
});

vi.mock("@/modules/finance/billing/dte-xml-compliance", () => ({
  enrichDteEmailRecipientsFromCrm: enrichEmailMock,
}));

import { prisma } from "@/lib/prisma";
import {
  toolPreviewEmitInvoiceDraft,
  toolEmitInvoiceDraft,
} from "@/lib/ai/help-chat-billing-draft-tools";
import { executeToolCallV2 } from "@/lib/ai/help-chat-tools-v2";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";

const permsIssue = {
  modules: { finance: "full" },
  submodules: {},
  capabilities: { facturacion_issue: true },
} as RolePermissions;

const permsViewOnly = {
  modules: { finance: "view" },
  submodules: {},
  capabilities: { facturacion_view: true },
} as RolePermissions;

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    date: new Date("2026-08-01T00:00:00.000Z"),
    dueDate: new Date("2026-08-31T00:00:00.000Z"),
    dteType: 33,
    receiverName: "Cliente Demo SpA",
    receiverRut: "76123456-0",
    receiverEmail: "facturacion@cliente.cl",
    receiverEmailCc: ["cc@cliente.cl"],
    netAmount: 1000000,
    taxAmount: 190000,
    totalAmount: 1190000,
    currency: "CLP",
    additionalReferences: [
      { tipoDocRef: "801", folioRef: "OC-99", fchRef: "2026-07-15", razonRef: "" },
      { tipoDocRef: "HES", folioRef: "HES-1", fchRef: "2026-07-20", razonRef: "" },
    ],
    crmAccountId: "acc-1",
    installationId: "inst-1",
    recurringTemplateId: "tpl-1",
    billingPeriod: "2026-08",
    ...overrides,
  };
}

describe("preview_emit_invoice_draft / emit_invoice_draft", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.financeDte.findFirst).mockReset();
    vi.mocked(prisma.financeDteRecurringRun.findFirst).mockReset();
    vi.mocked(prisma.financeDteRecurringTemplate.findFirst).mockReset();
    vi.mocked(prisma.crmInstallation.findFirst).mockReset();
    vi.mocked(prisma.crmAccount.findFirst).mockReset();
    issueDraftDteMock.mockReset();
    enrichEmailMock.mockReset();
    enrichEmailMock.mockResolvedValue({
      to: "facturacion@cliente.cl",
      cc: ["cc@cliente.cl"],
      adjusted: false,
    });
    vi.mocked(prisma.financeDteRecurringRun.findFirst).mockResolvedValue({
      template: { autoSendEmail: true },
    } as never);
    vi.mocked(prisma.financeDteRecurringTemplate.findFirst).mockResolvedValue({
      name: "Servicio Agosto",
    } as never);
    vi.mocked(prisma.crmInstallation.findFirst).mockResolvedValue({
      name: "Planta Norte",
    } as never);
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({
      name: "Cliente Demo SpA",
    } as never);
  });

  it("preview deniega sin facturacion_issue y no llama a issueDraftDte", async () => {
    const denied = await toolPreviewEmitInvoiceDraft("t1", "u1", permsViewOnly, {
      draftId: DRAFT_ID,
    });
    expect(denied).toMatchObject({ ok: false });
    expect(String((denied as { error: string }).error)).toMatch(/permiso/i);
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });

  it("preview no persiste: devuelve resumen + token y no llama a issueDraftDte", async () => {
    vi.mocked(prisma.financeDte.findFirst).mockResolvedValue(draftRow() as never);
    const preview = (await toolPreviewEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
    })) as {
      ok: true;
      data: {
        previewToken: string;
        receiverName: string;
        installationName: string;
        totalAmount: number;
        refsLabel: string;
        dteType: number;
        billingPeriod: string;
        emailTo: string;
        emailCc: string[];
        emailAttachments: string[];
        emailWillSend: boolean;
      };
    };
    expect(preview.ok).toBe(true);
    expect(preview.data.previewToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(preview.data.receiverName).toBe("Cliente Demo SpA");
    expect(preview.data.installationName).toBe("Planta Norte");
    expect(preview.data.totalAmount).toBe(1190000);
    expect(preview.data.refsLabel).toMatch(/OC/);
    expect(preview.data.refsLabel).toMatch(/HES/);
    expect(preview.data.dteType).toBe(33);
    expect(preview.data.billingPeriod).toBe("2026-08");
    expect(preview.data.emailTo).toBe("facturacion@cliente.cl");
    expect(preview.data.emailCc).toEqual(["cc@cliente.cl"]);
    expect(preview.data.emailAttachments).toEqual(["PDF", "XML"]);
    expect(preview.data.emailWillSend).toBe(true);
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });

  it("emit sin confirm no persiste", async () => {
    const refused = await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      previewToken: "tok",
    });
    expect(refused).toMatchObject({ ok: false });
    expect(String((refused as { error: string }).error)).toMatch(/confirmación/i);
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });

  it("emit sin previewToken no persiste aunque confirm=true", async () => {
    const refused = await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      confirm: true,
    });
    expect(refused).toMatchObject({ ok: false });
    expect(String((refused as { error: string }).error)).toMatch(/previewToken/i);
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });

  it("emit con confirm=true y token inválido no llama a issueDraftDte", async () => {
    const refused = await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      confirm: true,
      previewToken: "00000000-0000-4000-8000-000000000000",
    });
    expect(refused).toMatchObject({ ok: false });
    expect(String((refused as { error: string }).error)).toMatch(/expiró|previewToken/i);
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });

  it("preview + confirm llama issueDraftDte (mismo path que la UI) y no re-emite sin token", async () => {
    vi.mocked(prisma.financeDte.findFirst).mockResolvedValue(draftRow() as never);
    issueDraftDteMock.mockResolvedValue({
      id: "issued-1",
      folio: 4120,
      dteType: 33,
      receiverName: "Cliente Demo SpA",
      receiverRut: "76123456-0",
      totalAmount: 1190000,
      netAmount: 1000000,
      currency: "CLP",
      emailStatus: "sent",
      emailError: null,
    });

    const preview = (await toolPreviewEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
    })) as { ok: true; data: { previewToken: string } };

    const emitted = (await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      previewToken: preview.data.previewToken,
      confirm: true,
    })) as { ok: true; data: { folio: number; emailStatus: string } };

    expect(emitted.ok).toBe(true);
    expect(emitted.data.folio).toBe(4120);
    expect(emitted.data.emailStatus).toBe("sent");
    expect(issueDraftDteMock).toHaveBeenCalledTimes(1);
    expect(issueDraftDteMock).toHaveBeenCalledWith(
      "t1",
      DRAFT_ID,
      "u1",
      expect.objectContaining({
        canExcludeFromFlow: false,
      }),
    );

    const replay = await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      previewToken: preview.data.previewToken,
      confirm: true,
    });
    expect(replay).toMatchObject({ ok: false });
    expect(issueDraftDteMock).toHaveBeenCalledTimes(1);
  });

  it("si issueDraftDte lanza FutureIssueDateError no afirma éxito", async () => {
    vi.mocked(prisma.financeDte.findFirst).mockResolvedValue(draftRow() as never);
    const preview = (await toolPreviewEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
    })) as { ok: true; data: { previewToken: string } };
    issueDraftDteMock.mockRejectedValue(
      new FutureIssueDateError("2026-09-10", "2026-09-02"),
    );
    const refused = await toolEmitInvoiceDraft("t1", "u1", permsIssue, {
      draftId: DRAFT_ID,
      previewToken: preview.data.previewToken,
      confirm: true,
    });
    expect(refused).toMatchObject({ ok: false, code: "FUTURE_ISSUE_DATE" });
    expect(issueDraftDteMock).toHaveBeenCalledTimes(1);
  });

  it("executeToolCallV2 despacha preview y bloquea emit sin confirm", async () => {
    vi.mocked(prisma.financeDte.findFirst).mockResolvedValue(draftRow() as never);
    const preview = (await executeToolCallV2(
      "preview_emit_invoice_draft",
      { draftId: DRAFT_ID },
      "t1",
      "u1",
      permsIssue,
      false,
    )) as { ok: true; data: { previewToken: string } };
    expect(preview.ok).toBe(true);
    expect(issueDraftDteMock).not.toHaveBeenCalled();

    const blocked = await executeToolCallV2(
      "emit_invoice_draft",
      { draftId: DRAFT_ID, previewToken: preview.data.previewToken },
      "t1",
      "u1",
      permsIssue,
      false,
    );
    expect(blocked).toMatchObject({ ok: false });
    expect(issueDraftDteMock).not.toHaveBeenCalled();
  });
});
