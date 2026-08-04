/**
 * send-presentation: al enviar una propuesta consolidada sólo se tocan las
 * cotizaciones incluidas (`includedInProposal === true`). Las instalaciones
 * excluidas conservan su `status` y su `visibleInClientPortal`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const requireTenantModuleMock = vi.fn();
const requireAuthMock = vi.fn();
const requireCpqEditMock = vi.fn();

const bundleFindFirst = vi.fn();
const contactFindFirst = vi.fn();
const accountFindFirst = vi.fn();
const quoteUpdateMany = vi.fn();
const bundleUpdate = vi.fn();
const presentationFindFirst = vi.fn();
const presentationCreate = vi.fn();

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqProposalBundle: { findFirst: bundleFindFirst, update: bundleUpdate },
    crmContact: { findFirst: contactFindFirst },
    crmAccount: { findFirst: accountFindFirst },
    cpqQuote: { updateMany: quoteUpdateMany },
    crmCompanyPresentation: {
      findFirst: presentationFindFirst,
      create: presentationCreate,
    },
  },
}));

vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html></html>") }));
vi.mock("@/emails/PresentationEmail", () => ({ PresentationEmail: vi.fn(() => null) }));
vi.mock("@/lib/pdf/templates/proposal/build-bundle-proposal-props", () => ({
  buildBundleProposalProps: vi.fn(async () => ({ fileName: "prop.pdf" })),
}));
vi.mock("@/lib/pdf/templates/proposal/render-proposal", () => ({
  renderProposalToBufferFromProps: vi.fn(async () => Buffer.from("pdf")),
}));
vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn(async () => ({ commercialName: "Comercial" })),
}));
vi.mock("@/lib/crm-history", () => ({ createCrmHistoryLog: vi.fn() }));

const resendSend = vi.fn(async () => ({ data: { id: "email-1" }, error: null }));
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: resendSend } },
  EMAIL_CONFIG: { from: "from@x.cl", replyTo: "reply@x.cl" },
}));

const CTX = { userId: "u1", tenantId: "t1" };

function req(): NextRequest {
  return new Request("http://x/api/cpq/bundles/b1/send-presentation", {
    method: "POST",
    body: JSON.stringify({}),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTenantModuleMock.mockResolvedValue({ authorized: true });
  requireAuthMock.mockResolvedValue(CTX);
  requireCpqEditMock.mockResolvedValue(null);
  contactFindFirst.mockResolvedValue({
    id: "c1",
    firstName: "Ana",
    lastName: "Perez",
    email: "ana@cliente.cl",
  });
  accountFindFirst.mockResolvedValue({ name: "Cliente SA" });
  quoteUpdateMany.mockResolvedValue({ count: 2 });
  bundleUpdate.mockResolvedValue({});
  presentationFindFirst.mockResolvedValue(null);
  presentationCreate.mockResolvedValue({});
});

describe("POST /api/cpq/bundles/[id]/send-presentation", () => {
  it("filtra las cotizaciones por includedInProposal y sólo marca las incluidas", async () => {
    // El bundle devuelve SOLO las cotizaciones incluidas (la excluida q3 no viene).
    bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-2026-001",
      contactId: "c1",
      accountId: "acc-1",
      visibleInClientPortal: true,
      validUntil: null,
      quotes: [{ quoteId: "q1" }, { quoteId: "q2" }],
    });

    const { POST } = await import("../[id]/send-presentation/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);

    // El include del findFirst debe filtrar por includedInProposal: true.
    expect(bundleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          quotes: expect.objectContaining({
            where: { includedInProposal: true },
          }),
        }),
      }),
    );

    // updateMany sólo toca las incluidas (q1, q2), nunca la excluida q3.
    expect(quoteUpdateMany).toHaveBeenCalledTimes(1);
    const call = quoteUpdateMany.mock.calls[0][0];
    expect(call.where.id.in).toEqual(["q1", "q2"]);
    expect(call.where.id.in).not.toContain("q3");
    expect(call.where.tenantId).toBe("t1");
    // Como el bundle es visible, propaga visibleInClientPortal: true a las incluidas.
    expect(call.data).toMatchObject({ status: "sent", visibleInClientPortal: true });
  });

  it("rechaza el envío si no hay cotizaciones incluidas", async () => {
    bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-2026-002",
      contactId: "c1",
      accountId: "acc-1",
      visibleInClientPortal: null,
      validUntil: null,
      quotes: [],
    });

    const { POST } = await import("../[id]/send-presentation/route");
    const res = await POST(req(), { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(400);
    expect(quoteUpdateMany).not.toHaveBeenCalled();
  });
});
