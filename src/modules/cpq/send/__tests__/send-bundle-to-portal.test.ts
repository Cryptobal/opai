import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bundleFindFirst: vi.fn(),
  contactFindMany: vi.fn(),
  accountFindFirst: vi.fn(),
  adminFindFirst: vi.fn(),
  quoteUpdateMany: vi.fn(),
  bundleUpdate: vi.fn(),
  contactUpdateMany: vi.fn(),
  accountUpdateMany: vi.fn(),
  dealUpdateMany: vi.fn(),
  presentationFindFirst: vi.fn(),
  presentationCreate: vi.fn(),
  chatFindFirst: vi.fn(),
  chatCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqProposalBundle: {
      findFirst: mocks.bundleFindFirst,
      update: mocks.bundleUpdate,
    },
    crmContact: {
      findMany: mocks.contactFindMany,
      updateMany: mocks.contactUpdateMany,
    },
    crmAccount: {
      findFirst: mocks.accountFindFirst,
      updateMany: mocks.accountUpdateMany,
    },
    admin: { findFirst: mocks.adminFindFirst },
    cpqQuote: { updateMany: mocks.quoteUpdateMany },
    crmCompanyPresentation: {
      findFirst: mocks.presentationFindFirst,
      create: mocks.presentationCreate,
    },
    crmDeal: { updateMany: mocks.dealUpdateMany, findFirst: vi.fn() },
    chatChannel: { findFirst: mocks.chatFindFirst, create: mocks.chatCreate },
    chatChannelParticipant: { create: vi.fn() },
  },
}));

vi.mock("@/lib/email/send-tenant-email", () => ({
  sendTenantEmail: vi.fn(async () => ({ resendId: "em-1" })),
}));
vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html></html>"),
}));
vi.mock("@/emails/PortalProspectoInviteEmail", () => ({
  PortalProspectoInviteEmail: vi.fn(() => null),
}));
vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn(async () => ({
    commercialName: "Comercial",
    email: "from@x.cl",
  })),
}));
vi.mock("@/lib/pdf/templates/proposal/build-bundle-proposal-props", () => ({
  buildBundleProposalProps: vi.fn(async () => ({ fileName: "prop.pdf" })),
}));
vi.mock("@/lib/pdf/templates/proposal/render-proposal", () => ({
  renderProposalToBufferFromProps: vi.fn(async () => Buffer.from("pdf")),
}));
vi.mock("@/lib/pdf/templates/quotation/build-quotation-props", () => ({
  buildQuotationProps: vi.fn(),
}));
vi.mock("@/lib/pdf/templates/quotation/render-quotation", () => ({
  renderQuotationToBuffer: vi.fn(),
}));
vi.mock("@/lib/portal-cliente-url", () => ({
  buildPortalClienteInviteUrl: vi.fn(async () => "https://opai.test/portal/cliente"),
}));
vi.mock("@/lib/whatsapp-templates", () => ({
  getWaTemplate: vi.fn(async () => "hola"),
}));
vi.mock("@/lib/crm/sync-lead-on-proposal-sent", () => ({
  syncLeadOnProposalSent: vi.fn(),
}));
vi.mock("@/lib/crm/advance-deal-on-quote-sent", () => ({
  markDealProposalSent: vi.fn(),
  advanceDealToQuoteSentStage: vi.fn(),
}));
vi.mock("@/lib/followup-scheduler", () => ({
  scheduleFollowUps: vi.fn(),
  cancelPendingFollowUps: vi.fn(),
}));
vi.mock("@/lib/integrations/slack/deal-rooms/room", () => ({
  openDealRoom: vi.fn(),
}));
vi.mock("@/lib/crm-history", () => ({ createCrmHistoryLog: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hash") },
}));

import { sendBundleToPortal } from "../send-bundle-to-portal";
import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import { buildBundleProposalProps } from "@/lib/pdf/templates/proposal/build-bundle-proposal-props";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chatFindFirst.mockResolvedValue(null);
  mocks.chatCreate.mockResolvedValue({});
  mocks.accountFindFirst.mockResolvedValue({
    id: "acc-1",
    name: "Cliente SA",
    status: "prospect",
    portalEjecutivoId: null,
  });
  mocks.adminFindFirst.mockResolvedValue({ name: "Eva", email: "eva@x.cl", cargo: "Ejecutiva" });
  mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
  mocks.dealUpdateMany.mockResolvedValue({ count: 1 });
  mocks.presentationFindFirst.mockResolvedValue({ id: "p1" });
  mocks.quoteUpdateMany.mockResolvedValue({ count: 2 });
  mocks.bundleUpdate.mockResolvedValue({});
  mocks.contactUpdateMany.mockResolvedValue({ count: 1 });
});

describe("sendBundleToPortal", () => {
  it("rechaza si no hay cotizaciones incluidas", async () => {
    mocks.bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-1",
      dealId: "d1",
      accountId: "acc-1",
      contactId: "c1",
      quotes: [],
    });
    await expect(
      sendBundleToPortal({ bundleId: "b1", tenantId: "t1", userId: "u1" }),
    ).rejects.toThrow(/incluidas/);
    expect(mocks.quoteUpdateMany).not.toHaveBeenCalled();
  });

  it("envía un correo por destinatario y CC solo en el primero; marca sólo incluidas", async () => {
    mocks.bundleFindFirst.mockResolvedValue({
      id: "b1",
      code: "PROP-2026-001",
      name: "Retail",
      dealId: "d1",
      accountId: "acc-1",
      contactId: "c1",
      visibleInClientPortal: true,
      quotes: [
        {
          quoteId: "q1",
          quote: {
            id: "q1",
            monthlyCost: 100,
            createdFromLeadId: null,
            installationId: null,
            positions: [{ id: "p1", numGuards: 2, numPuestos: 1 }],
          },
        },
        {
          quoteId: "q2",
          quote: {
            id: "q2",
            monthlyCost: 200,
            createdFromLeadId: null,
            installationId: null,
            positions: [],
          },
        },
      ],
    });
    mocks.contactFindMany
      .mockResolvedValueOnce([
        {
          id: "c1",
          firstName: "Ana",
          lastName: "Perez",
          email: "ana@cliente.cl",
          phone: null,
          portalEnabled: true,
          portalPin: "hash",
          portalPinVisible: "1234",
        },
        {
          id: "c2",
          firstName: "Luis",
          lastName: "Soto",
          email: "luis@cliente.cl",
          phone: null,
          portalEnabled: true,
          portalPin: "hash",
          portalPinVisible: "5678",
        },
      ])
      .mockResolvedValueOnce([{ email: "cc@cliente.cl" }]);

    const result = await sendBundleToPortal({
      bundleId: "b1",
      tenantId: "t1",
      userId: "u1",
      recipientContactIds: ["c1", "c2"],
      ccContactIds: ["c3"],
      bccEmails: ["oculto@x.cl"],
      includeProposalPdf: true,
    });

    expect(buildBundleProposalProps).toHaveBeenCalledWith("b1", "t1");
    expect(sendTenantEmail).toHaveBeenCalledTimes(2);
    const first = vi.mocked(sendTenantEmail).mock.calls[0]![0];
    const second = vi.mocked(sendTenantEmail).mock.calls[1]![0];
    expect(first.to).toBe("ana@cliente.cl");
    expect(first.cc).toEqual(expect.arrayContaining(["from@x.cl", "cc@cliente.cl"]));
    expect(first.bcc).toEqual(["oculto@x.cl"]);
    expect(second.to).toBe("luis@cliente.cl");
    expect(second.cc).toBeUndefined();
    expect(second.bcc).toBeUndefined();

    expect(mocks.quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["q1", "q2"] }, tenantId: "t1" },
      data: { status: "sent", visibleInClientPortal: true },
    });
    expect(result.sentToList).toEqual(["ana@cliente.cl", "luis@cliente.cl"]);
    expect(result.quotesMarkedSent).toBe(2);
  });
});
