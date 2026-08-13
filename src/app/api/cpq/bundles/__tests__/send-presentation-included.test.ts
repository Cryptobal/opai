/**
 * send-presentation: delega en sendBundleToPortal (portal + PIN por destinatario).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const requireTenantModuleMock = vi.fn();
const requireAuthMock = vi.fn();
const requireCpqEditMock = vi.fn();
const sendBundleToPortalMock = vi.fn();

vi.mock("@/lib/require-module", () => ({
  requireTenantModule: requireTenantModuleMock,
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));
vi.mock("@/lib/api-auth-cpq", () => ({
  requireCpqEdit: requireCpqEditMock,
}));
vi.mock("@/modules/cpq/send/send-bundle-to-portal", () => ({
  sendBundleToPortal: sendBundleToPortalMock,
  SendBundleToPortalError: class SendBundleToPortalError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SendBundleToPortalError";
    }
  },
}));

const CTX = { userId: "u1", tenantId: "t1" };

function req(body: Record<string, unknown> = {}): NextRequest {
  return new Request("http://x/api/cpq/bundles/b1/send-presentation", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTenantModuleMock.mockResolvedValue({ authorized: true });
  requireAuthMock.mockResolvedValue(CTX);
  requireCpqEditMock.mockResolvedValue(null);
});

describe("POST /api/cpq/bundles/[id]/send-presentation", () => {
  it("reenvía destinatarios, CC/CCO y adjuntos a sendBundleToPortal", async () => {
    sendBundleToPortalMock.mockResolvedValue({
      emailId: "em1",
      sentTo: "ana@cliente.cl",
      sentToList: ["ana@cliente.cl"],
      quotesMarkedSent: 2,
    });

    const { POST } = await import("../[id]/send-presentation/route");
    const res = await POST(
      req({
        recipientContactIds: ["c1", "c2"],
        ccContactIds: ["c3"],
        ccEmails: ["cc@x.cl"],
        bccEmails: ["bcc@x.cl"],
        includeProposalPdf: true,
        includeQuotationPdf: false,
        emailSubject: "Propuesta consolidada",
        followUp: { include: true, targetStageId: null },
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(200);
    expect(sendBundleToPortalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleId: "b1",
        tenantId: "t1",
        userId: "u1",
        recipientContactIds: ["c1", "c2"],
        ccContactIds: ["c3"],
        ccEmails: ["cc@x.cl"],
        bccEmails: ["bcc@x.cl"],
        includeProposalPdf: true,
        includeQuotationPdf: false,
        emailSubject: "Propuesta consolidada",
      }),
    );
  });

  it("rechaza el envío si el servicio indica que no hay incluidas", async () => {
    const { SendBundleToPortalError } = await import(
      "@/modules/cpq/send/send-bundle-to-portal"
    );
    sendBundleToPortalMock.mockRejectedValue(
      new SendBundleToPortalError("No hay cotizaciones incluidas para enviar"),
    );

    const { POST } = await import("../[id]/send-presentation/route");
    const res = await POST(req({}), { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/incluidas/);
  });
});
